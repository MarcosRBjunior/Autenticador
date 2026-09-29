const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const AppError = require('../utils/AppError');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// O bloqueio passa pelo errorHandler para sair no formato padrão de erro.
function tooManyRequests(req, res, next) {
  next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Tente novamente mais tarde.'));
}

// Contagem em memória, por instância. Na Vercel isso não é compartilhado entre
// instâncias; a store no Mongo entra na US-20 (D-15).
function createRateLimiter({ windowMs, limit, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests,
    ...options,
  });
}

// Conta toda tentativa, inclusive as inválidas: é o que segura spam de cadastro.
const registerLimiter = createRateLimiter({ windowMs: HOUR, limit: 10 });

// Chave IP + usuário: errar a senha de uma conta não bloqueia as outras que
// saem do mesmo IP (uma rede de escritório, por exemplo). O ipKeyGenerator
// agrupa endereços IPv6 da mesma rede, que o cliente troca com facilidade.
function loginKey(req) {
  const { username } = req.body ?? {};
  const account = typeof username === 'string' ? username.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip)}:${account}`;
}

// Só as tentativas que falham contam: quem acerta a senha não se bloqueia.
const loginLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
});

// Todo pedido conta (a resposta é sempre 200). A chave IP + e-mail segura quem
// tenta encher a caixa de alguém de links, sem travar os outros e-mails que
// saem do mesmo IP.
function forgotPasswordKey(req) {
  const { email } = req.body ?? {};
  const account = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip)}:${account}`;
}

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: forgotPasswordKey,
});

module.exports = { registerLimiter, loginLimiter, forgotPasswordLimiter };
