const { rateLimit } = require('express-rate-limit');
const AppError = require('../utils/AppError');

const HOUR = 60 * 60 * 1000;

// O bloqueio passa pelo errorHandler para sair no formato padrão de erro.
function tooManyRequests(req, res, next) {
  next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Tente novamente mais tarde.'));
}

// Contagem em memória, por instância. Na Vercel isso não é compartilhado entre
// instâncias; a store no Mongo entra na US-20 (D-15).
function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests,
  });
}

// Conta toda tentativa, inclusive as inválidas: é o que segura spam de cadastro.
const registerLimiter = createRateLimiter({ windowMs: HOUR, limit: 10 });

module.exports = { registerLimiter };
