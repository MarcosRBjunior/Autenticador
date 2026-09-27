const { isPublicRoute } = require('../src/middlewares/authGuard');

const req = (method, path) => ({ method, path });

describe('isPublicRoute', () => {
  it.each([
    ['GET', '/api/v1/health'],
    ['POST', '/api/v1/register'],
    ['POST', '/api/v1/login'],
    ['POST', '/api/v1/auth/forgot-password'],
    ['POST', '/api/v1/auth/reset-password'],
    ['GET', '/api/v1/auth/activate/3f9a0c1b2d'],
    ['POST', '/api/v1/auth/resend-activation'],
    ['GET', '/login'],
    ['GET', '/register'],
    ['GET', '/forgot-password'],
    ['GET', '/reset-password'],
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
    ['GET', '/api/v1/auth/activate/', 'ativação sem token'],
    ['GET', '/api/v1/auth/activate/a/b', 'ativação com segmento extra'],
    ['POST', '/login', 'formulário ainda não liberado (entra na US-18)'],
  ])('protege %s %s (%s)', (method, path) => {
    expect(isPublicRoute(req(method, path))).toBe(false);
  });
});
