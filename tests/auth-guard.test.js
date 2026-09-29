const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const tokenService = require('../src/services/TokenService');
const app = require('../src/app');

// CORS_ORIGIN fixado em tests/setup-env.js.
const ALLOWED_ORIGIN = 'http://localhost:5173';

let token;

beforeAll(db.connect);
beforeEach(async () => {
  const user = await User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    isActive: true,
  });
  token = tokenService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });
});
afterEach(db.clear);
afterAll(db.close);

describe('proteção global de rotas', () => {
  it.each(['/API/v1/nada', '/api'])('%s sem token: 401 JSON', async (path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('responde 401 para rota fora da allowlist sem token', async () => {
    const res = await request(app).get('/api/v1/qualquer-coisa');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('deixa a requisição seguir com token válido (aqui até o 404)', async () => {
    const res = await request(app)
      .get('/api/v1/qualquer-coisa')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('aceita o token pelo cookie em qualquer rota', async () => {
    const res = await request(app)
      .get('/api/v1/qualquer-coisa')
      .set('Cookie', `access_token=${token}`);

    expect(res.status).toBe(404);
  });

  it.each([
    ['GET', '/api/v1/health', 200],
    ['HEAD', '/api/v1/health', 200],
    ['POST', '/api/v1/register', 400],
    ['POST', '/api/v1/login', 400],
    ['POST', '/api/v1/auth/forgot-password', 400],
    ['POST', '/api/v1/auth/reset-password', 400],
    ['POST', '/api/v1/auth/activate', 400],
    ['POST', '/api/v1/auth/resend-activation', 400],
  ])('libera %s %s sem token', async (method, path, expected) => {
    const call = request(app)[method.toLowerCase()](path);
    const res = method === 'POST' ? await call.send({}) : await call;

    expect(res.status).toBe(expected);
  });

  it('protege rota com nome parecido com uma pública', async () => {
    const res = await request(app).post('/api/v1/login-admin').send({});

    expect(res.status).toBe(401);
  });
});

describe('CORS', () => {
  it('responde o preflight sem exigir token', async () => {
    const res = await request(app)
      .options('/api/v1/qualquer-coisa')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('libera a origem configurada e permite cookies', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', ALLOWED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('não libera outras origens', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('helmet', () => {
  it('envia os headers de segurança', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});
