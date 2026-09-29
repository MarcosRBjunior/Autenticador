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

// O limite roda antes da validação: a conta entra na chave cortada no tamanho
// máximo de um e-mail, para um texto enorme não virar uma chave enorme na memória.
const MAX_ACCOUNT_LENGTH = 254;

// Chave IP + conta (o campo `field` do body): errar a senha de uma conta, ou
// pedir links para ela, não bloqueia as outras que saem do mesmo IP (uma rede
// de escritório, por exemplo). O ipKeyGenerator agrupa endereços IPv6 da mesma
// rede, que o cliente troca com facilidade.
function accountKey(field) {
  return (req) => {
    const value = req.body?.[field];
    const account =
      typeof value === 'string' ? value.trim().toLowerCase().slice(0, MAX_ACCOUNT_LENGTH) : '';
    return `${ipKeyGenerator(req.ip)}:${account}`;
  };
}

// Só as tentativas que falham contam: quem acerta a senha não se bloqueia.
const loginLimiter = createRateLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: accountKey('username'),
  skipSuccessfulRequests: true,
});

// Todo pedido conta (a resposta é sempre 200). São dois limites: por IP +
// e-mail, contra quem tenta encher a caixa de alguém de links; e só por IP,
// contra quem dispara e-mails para todos os cadastrados, gastando a cota do
// SMTP e a reputação do remetente.
const forgotPasswordLimiters = [
  createRateLimiter({ windowMs: HOUR, limit: 20 }),
  createRateLimiter({ windowMs: 15 * MINUTE, limit: 5, keyGenerator: accountKey('email') }),
];

// Adivinhar o token é inviável (256 bits): este limite, folgado, só segura
// quem martela a rota.
const resetPasswordLimiter = createRateLimiter({ windowMs: 15 * MINUTE, limit: 10 });

module.exports = { registerLimiter, loginLimiter, forgotPasswordLimiters, resetPasswordLimiter };
