const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const app = require('../src/app');

// Um IP por teste (TRUST_PROXY=1 nos testes) para os limites não se somarem.
let lastIp = 0;
const newIp = () => `198.51.100.${++lastIp}`;

const login = (body, ip = newIp()) =>
  request(app).post('/api/v1/login').set('X-Forwarded-For', ip).send(body);

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    isActive: true,
    ...overrides,
  });

const RIGHT = { username: 'ana', password: 'senha-forte-123' };
const WRONG = { username: 'ana', password: 'senha-errada' };

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('POST /api/v1/login', () => {
  it('responde 200 com token, expiresIn e o usuário sem a senha', async () => {
    const user = await createUser();

    const res = await login(RIGHT);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ expiresIn: 3600, user: { username: 'ana', role: 'user' } });
    expect(res.body.user).not.toHaveProperty('password');
    expect(jwt.decode(res.body.token)).toMatchObject({
      sub: user.id,
      role: 'user',
      tv: 0,
      exp: expect.any(Number),
    });
  });

  it('grava o token num cookie httpOnly, Secure e SameSite=Lax', async () => {
    await createUser();

    const res = await login(RIGHT);

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('access_token='));
    expect(cookie).toContain(`access_token=${res.body.token}`);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Max-Age=3600/);
  });

  it('aceita o e-mail no lugar do username', async () => {
    await createUser();

    const res = await login({ username: 'ANA@example.com', password: 'senha-forte-123' });

    expect(res.status).toBe(200);
  });

  it('devolve a mesma resposta 401 para senha errada e usuário inexistente', async () => {
    await createUser();

    const wrongPassword = await login(WRONG);
    const unknownUser = await login({ username: 'ninguem', password: 'senha-errada' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body).toEqual(wrongPassword.body);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('responde 400 e nunca autentica com {"username": {"$gt": ""}}', async () => {
    await createUser();

    const res = await login({ username: { $gt: '' }, password: 'senha-forte-123' });

    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('responde 403 ACCOUNT_INACTIVE para conta não ativada', async () => {
    await createUser({ isActive: false });

    const res = await login(RIGHT);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  describe('rate limit (5 tentativas em 15 min por IP + usuário)', () => {
    it('bloqueia a 6ª tentativa, mesmo com a senha certa', async () => {
      await createUser();
      const ip = newIp();
      for (let i = 0; i < 5; i++) {
        expect((await login(WRONG, ip)).status).toBe(401);
      }

      const blocked = await login(RIGHT, ip);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('conta separado para cada usuário no mesmo IP', async () => {
      await createUser();
      const ip = newIp();
      for (let i = 0; i < 5; i++) await login({ username: 'outra', password: 'x' }, ip);

      const res = await login(RIGHT, ip);

      expect(res.status).toBe(200);
    });

    it('não conta os logins que dão certo', async () => {
      await createUser();
      const ip = newIp();

      for (let i = 0; i < 6; i++) {
        expect((await login(RIGHT, ip)).status).toBe(200);
      }
    });
  });
});
