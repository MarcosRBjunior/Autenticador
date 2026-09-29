const crypto = require('node:crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

// Token de duplo envio assinado (OWASP): o cookie guarda um valor aleatório e o
// formulário leva a assinatura dele. Outro site não lê o cookie da vítima nem
// sabe assinar, então não monta um formulário que passe.
const COOKIE = 'csrf';
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
const VALUE = /^[a-f0-9]{64}$/;

const sign = (value) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`csrf:${value}`).digest('hex');

// timingSafeEqual exige o mesmo tamanho em bytes, não em caracteres.
const sameText = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function tokenFor(req, res) {
  let value = req.cookies?.[COOKIE];
  if (typeof value !== 'string' || !VALUE.test(value)) {
    value = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, value, COOKIE_OPTIONS);
  }
  res.locals.csrfToken = sign(value);
}

// GET de página com formulário.
function issueCsrf(req, res, next) {
  tokenFor(req, res);
  next();
}

// POST de página: o campo _csrf precisa ser a assinatura do cookie. Renova o
// token para a página poder ser mostrada de novo com os erros do formulário.
function verifyCsrf(req, res, next) {
  const value = req.cookies?.[COOKIE];
  const sent = req.body?._csrf;
  const valid =
    typeof value === 'string' &&
    VALUE.test(value) &&
    typeof sent === 'string' &&
    sameText(sign(value), sent);
  if (!valid) {
    throw new AppError(
      403,
      'CSRF_INVALID',
      'A página expirou. Volte ao formulário e envie de novo.',
    );
  }
  tokenFor(req, res);
  next();
}

module.exports = { issueCsrf, verifyCsrf };
