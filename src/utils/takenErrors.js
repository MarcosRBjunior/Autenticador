const AppError = require('./AppError');

// 409 por campo único já em uso. details segue o formato dos erros de
// validação (campo → mensagens), para a interface tratar os dois do mesmo jeito.
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

// Traduz a colisão no índice único (E11000) para o 409 do campo. Qualquer
// outro erro volta como veio.
function toTakenError(err) {
  if (err?.code !== 11000) return err;
  const field = Object.keys(err.keyPattern ?? {})[0];
  return TAKEN[field]?.() ?? err;
}

module.exports = { TAKEN, toTakenError };
