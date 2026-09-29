const { isAuthenticated, authenticate } = require('./auth');
const AppError = require('../utils/AppError');
const { isApiRequest } = require('../utils/requestKind');
const { clearSessionCookie } = require('../utils/sessionCookie');

// Rotas liberadas sem token: método + caminho exatos (ou regex ancorada).
// Inclui as rotas públicas da API e as páginas de acesso (login, cadastro,
// ativação, recuperação de senha). Qualquer coisa que não bata exatamente fica
// protegida e exige sessão: 401 JSON na /api, redirecionamento para /login nas
// páginas.
const PUBLIC_ROUTES = [
  ['GET', '/'],
  ['GET', '/api/v1/health'],
  ['POST', '/api/v1/register'],
  ['POST', '/api/v1/login'],
  ['POST', '/api/v1/auth/forgot-password'],
  ['POST', '/api/v1/auth/reset-password'],
  ['POST', '/api/v1/auth/activate'],
  ['POST', '/api/v1/auth/resend-activation'],
  ['GET', '/login'],
  ['POST', '/login'],
  ['GET', '/register'],
  ['POST', '/register'],
  ['GET', '/activate'],
  ['POST', '/activate'],
  ['GET', '/resend-activation'],
  ['POST', '/resend-activation'],
  ['GET', '/forgot-password'],
  ['GET', '/reset-password'],
  ['POST', '/forgot-password'],
  ['POST', '/reset-password'],
  // O logout identifica o usuário por conta própria (identifyUser) e sai com
  // sucesso mesmo com token ausente, expirado ou já invalidado.
  ['POST', '/api/v1/logout'],
  ['GET', '/logout'],
  ['POST', '/logout'],
];

function isPublicRoute(req) {
  // O Express atende HEAD com a rota GET correspondente.
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  return PUBLIC_ROUTES.some(
    ([allowedMethod, path]) =>
      allowedMethod === method &&
      (path instanceof RegExp ? path.test(req.path) : path === req.path),
  );
}

// Aplicado globalmente antes das rotas: tudo exige token, exceto a allowlist.
// Na API, sem sessão é 401 em JSON; nas páginas, volta para o login.
async function authGuard(req, res, next) {
  if (isPublicRoute(req)) return next();
  if (isApiRequest(req)) return isAuthenticated(req, res, next);

  try {
    req.user = await authenticate(req);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    clearSessionCookie(res);
    return res.redirect('/login');
  }
  // Página com dados da conta: o botão voltar não pode mostrá-la depois do logout.
  res.set('Cache-Control', 'no-store');
  return next();
}

module.exports = { authGuard, isPublicRoute };
