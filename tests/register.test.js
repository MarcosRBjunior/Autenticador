const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const app = require('../src/app');

// O app confia em 1 proxy nos testes (TRUST_PROXY=1 em setup-env.js), como na
// Vercel. Cada teste usa um IP próprio para não consumir o limite dos outros.
let lastIp = 0;
const newIp = () => `203.0.113.${++lastIp}`;

const register = (body, ip = newIp()) =>
  request(app).post('/api/v1/register').set('X-Forwarded-For', ip).send(body);

const validBody = (overrides = {}) => ({
  username: 'ana',
  email: 'ana@example.com',
  password: 'senha-forte-123',
  ...overrides,
});

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('POST /api/v1/register', () => {
  it('responde 201 com o usuário, sem password nem tokenVersion', async () => {
    const res = await register(validBody());

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      username: 'ana',
      email: 'ana@example.com',
      role: 'user',
      isActive: false,
    });
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('tokenVersion');
  });

  it('salva a senha como hash bcrypt', async () => {
    await register(validBody());

    const { password } = await User.findOne({ username: 'ana' }).select('+password').lean();
    expect(password).toMatch(/^\$2b\$/);
    expect(password).not.toContain('senha-forte-123');
  });

  it('cria usuário comum mesmo com role admin no body', async () => {
    const res = await register(validBody({ role: 'admin' }));

    expect(res.status).toBe(201);
    const stored = await User.findOne({ username: 'ana' }).lean();
    expect(stored.role).toBe('user');
  });

  it('responde 409 para username repetido com caixa diferente', async () => {
    await register(validBody({ username: 'Ana' }));

    const res = await register(validBody({ username: 'ana', email: 'outra@example.com' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('responde 409 para e-mail repetido, mesmo com maiúsculas', async () => {
    await register(validBody());

    const res = await register(validBody({ username: 'outra', email: 'ANA@example.com' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('responde 400 com os erros por campo', async () => {
    const res = await register({ username: 'a b', email: 'x', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details).sort()).toEqual(['email', 'password', 'username']);
  });

  describe('rate limit', () => {
    it('bloqueia a 11ª tentativa na mesma hora vinda do mesmo IP', async () => {
      const ip = newIp();
      for (let i = 0; i < 10; i++) {
        const res = await register({}, ip);
        expect(res.status).toBe(400);
      }

      const blocked = await register(validBody(), ip);

      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({
        error: { code: 'TOO_MANY_REQUESTS', message: expect.any(String) },
      });
      expect(blocked.headers).toHaveProperty('ratelimit');
    });

    it('não afeta outro IP', async () => {
      const ip = newIp();
      for (let i = 0; i < 11; i++) await register({}, ip);

      const res = await register(validBody());

      expect(res.status).toBe(201);
    });
  });
});
