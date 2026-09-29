const bcrypt = require('bcrypt');
const userRepository = require('../repositories/UserRepository');
const tokenService = require('./TokenService');
const authTokenService = require('./AuthTokenService');
const mailService = require('./MailService');
const AppError = require('../utils/AppError');
const { TAKEN, toTakenError } = require('../utils/takenErrors');

// Hash de uma senha aleatória descartada, com o mesmo custo (12) do model
// User. Quando o usuário não existe, o bcrypt compara contra ele para a
// resposta demorar o mesmo e não denunciar quais usernames existem.
const DUMMY_PASSWORD_HASH = '$2b$12$KQukYzH1xnYTgbahuP1RuuyiTwDisPXwRMzgfA00/NGsvUIpwNWgq';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Usuário ou senha inválidos');

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
    throw toTakenError(err);
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

// D-12: o JWT é stateless, então sair = incrementar o tokenVersion. Isso derruba
// todas as sessões do usuário, em qualquer dispositivo. Sem usuário (token
// ausente ou já inválido) não há o que invalidar.
async function logout(user) {
  if (!user) return;
  await userRepository.incrementTokenVersion(user.id);
}

// RN-10: o link de reset vale 30 minutos.
const PASSWORD_RESET_TTL_MINUTES = 30;

// Roda depois da resposta genérica do forgot, então quem pediu não fica sabendo
// se o e-mail tem conta. O destinatário é o e-mail do usuário achado no banco.
async function requestPasswordReset(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) return;

  const token = await authTokenService.issue({
    userId: user.id,
    type: 'password_reset',
    ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
  await mailService.sendPasswordResetEmail({
    user,
    token,
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
}

module.exports = { register, login, logout, requestPasswordReset };
