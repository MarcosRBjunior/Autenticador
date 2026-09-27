const bcrypt = require('bcrypt');
const userRepository = require('../repositories/UserRepository');
const tokenService = require('./TokenService');
const AppError = require('../utils/AppError');

// Hash de uma senha aleatória descartada, com o mesmo custo (12) do model
// User. Quando o usuário não existe, o bcrypt compara contra ele para a
// resposta demorar o mesmo e não denunciar quais usernames existem.
const DUMMY_PASSWORD_HASH = '$2b$12$KQukYzH1xnYTgbahuP1RuuyiTwDisPXwRMzgfA00/NGsvUIpwNWgq';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Usuário ou senha inválidos');

// details segue o formato dos erros de validação (campo → mensagens), para a
// interface tratar os dois do mesmo jeito.
const TAKEN = {
  username: () =>
    new AppError(409, 'USERNAME_TAKEN', 'Username já cadastrado', {
      username: ['Este username já está em uso'],
    }),
  email: () =>
    new AppError(409, 'EMAIL_TAKEN', 'E-mail já cadastrado', {
      email: ['Este e-mail já está cadastrado'],
    }),
};

async function register({ username, email, password }) {
  const existing = await userRepository.findByUsernameOrEmail(username, email);
  if (existing) {
    throw existing.email === email.toLowerCase() ? TAKEN.email() : TAKEN.username();
  }

  try {
    // role e isActive fixos aqui, nunca vindos da requisição. A conta nasce
    // inativa; a ativação por e-mail entra na US-17.
    return await userRepository.create({
      username,
      email,
      password,
      role: 'user',
      isActive: false,
    });
  } catch (err) {
    // Registro simultâneo: passou pela checagem acima, mas o índice único barrou.
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern ?? {})[0];
      if (TAKEN[field]) throw TAKEN[field]();
    }
    throw err;
  }
}

// `username` aceita o username ou o e-mail.
async function login({ username, password }) {
  const user = await userRepository.findByUsernameOrEmail(username, username, {
    withPassword: true,
  });

  const passwordMatches = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) throw invalidCredentials();

  // Só depois da senha certa: quem erra a senha não descobre que a conta existe.
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Conta ainda não ativada. Verifique seu e-mail.');
  }

  const token = tokenService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });
  return { token, expiresIn: tokenService.EXPIRES_IN_SECONDS, user };
}

module.exports = { register, login };
