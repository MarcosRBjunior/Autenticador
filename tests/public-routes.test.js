const { isPublicRoute } = require('../src/middlewares/authGuard');

const req = (method, path) => ({ method, path });

describe('isPublicRoute', () => {
  it.each([
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
    ['GET', '/forgot-password'],
    ['GET', '/reset-password'],
    // Logout responde 204 (ou redireciona) até com token inválido.
    ['POST', '/api/v1/logout'],
    ['GET', '/logout'],
  ])('libera %s %s', (method, path) => {
    expect(isPublicRoute(req(method, path))).toBe(true);
  });

  it('trata HEAD como o GET correspondente', () => {
    expect(isPublicRoute(req('HEAD', '/api/v1/health'))).toBe(true);
  });

  it.each([
    ['POST', '/api/v1/health', 'método diferente do liberado'],
    ['GET', '/api/v1/login', 'método diferente do liberado'],
    ['GET', '/api/v1/users', 'rota protegida'],
    ['GET', '/admin', 'rota protegida'],
    ['POST', '/api/v1/login-admin', 'nome parecido com uma rota pública'],
    ['POST', '/api/v1/login/extra', 'caminho mais longo que o público'],
    ['GET', '/api/v1/health/../users', 'tentativa de subir de diretório'],
    [
      'GET',
      '/api/v1/auth/activate/3f9a0c1b2d',
      'ativação por GET, que scanners de link abrem sozinhos',
    ],
    ['GET', '/api/v1/auth/activate', 'ativação só por POST'],
    ['GET', '/api/v1/logout', 'logout da API só por POST'],
    ['GET', '/api/v1/me', 'rota protegida'],
  ])('protege %s %s (%s)', (method, path) => {
    expect(isPublicRoute(req(method, path))).toBe(false);
  });
});
