const { isAuthenticated } = require('./auth');

// Rotas liberadas sem token: método + caminho exatos (ou regex ancorada).
// Qualquer coisa que não bata exatamente fica protegida. Algumas ainda não
// existem (recuperação de senha e ativação chegam nas US-16/17, as páginas na
// US-18) e respondem 404 até lá.
const PUBLIC_ROUTES = [
  ['GET', '/api/v1/health'],
  ['POST', '/api/v1/register'],
  ['POST', '/api/v1/login'],
  ['POST', '/api/v1/auth/forgot-password'],
  ['POST', '/api/v1/auth/reset-password'],
  ['GET', /^\/api\/v1\/auth\/activate\/[^/]+$/],
  ['POST', '/api/v1/auth/resend-activation'],
  ['GET', '/login'],
  ['GET', '/register'],
  ['GET', '/forgot-password'],
  ['GET', '/reset-password'],
  // O logout identifica o usuário por conta própria (identifyUser) e sai com
  // sucesso mesmo com token ausente, expirado ou já invalidado.
  ['POST', '/api/v1/logout'],
  ['GET', '/logout'],
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
function authGuard(req, res, next) {
  if (isPublicRoute(req)) return next();
  return isAuthenticated(req, res, next);
}

module.exports = { authGuard, isPublicRoute };
