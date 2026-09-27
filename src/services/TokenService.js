const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Fixar o algoritmo na verificação barra `alg: none` e a troca por outro HMAC.
const ALGORITHM = 'HS256';
const EXPIRES_IN_SECONDS = 60 * 60;

// sub = id do usuário, role = perfil, tv = tokenVersion (invalida o token
// quando o usuário troca a senha, faz logout ou muda de perfil).
function sign({ sub, role, tv }) {
  return jwt.sign({ sub, role, tv }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: EXPIRES_IN_SECONDS,
  });
}

// Lança JsonWebTokenError (ou TokenExpiredError) para qualquer token inválido.
function verify(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { sign, verify, EXPIRES_IN_SECONDS };
