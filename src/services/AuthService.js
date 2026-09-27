const userRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');

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

module.exports = { register };
