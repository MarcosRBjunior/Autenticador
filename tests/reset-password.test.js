const request = require('supertest');
const db = require('./helpers/db');
const { tokenFor } = require('./helpers/auth');
const User = require('../src/models/User');
const AuthToken = require('../src/models/AuthToken');
const authTokenService = require('../src/services/AuthTokenService');
const mailService = require('../src/services/MailService');
const background = require('../src/utils/background');
const app = require('../src/app');

// Um IP por chamada (TRUST_PROXY=1 nos testes) para o limite do login não somar.
let lastIp = 0;
const newIp = () => `203.0.113.${++lastIp}`;

const OLD_PASSWORD = 'senha-antiga-123';
const NEW_PASSWORD = 'senha-nova-456';

const reset = (body) =>
  request(app).post('/api/v1/auth/reset-password').set('X-Forwarded-For', newIp()).send(body);

const login = (password) =>
  request(app)
    .post('/api/v1/login')
    .set('X-Forwarded-For', newIp())
    .send({ username: 'ana', password });

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: OLD_PASSWORD,
    isActive: true,
    ...overrides,
  });

const issueReset = (user) =>
  authTokenService.issue({ userId: user.id, type: 'password_reset', ttlMinutes: 30 });

const expectInvalidToken = (res) => {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('TOKEN_INVALID_OR_EXPIRED');
};

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('POST /api/v1/auth/reset-password', () => {
  it('com o link recebido no forgot, troca a senha', async () => {
    await createUser();
    const run = jest.spyOn(background, 'run');
    const sendResetEmail = jest.spyOn(mailService, 'sendPasswordResetEmail');
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', newIp())
      .send({ email: 'ana@example.com' });
    await run.mock.results[0].value;
    const [{ token }] = sendResetEmail.mock.calls[0];

    const res = await reset({ token, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: expect.any(String) });
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('a senha antiga deixa de funcionar', async () => {
    const user = await createUser();

    await reset({ token: await issueReset(user), newPassword: NEW_PASSWORD });

    expect((await login(OLD_PASSWORD)).status).toBe(401);
  });

  // RN-11: quem estava logado com a senha antiga (talvez um invasor) cai fora.
  it('derruba os JWTs emitidos antes do reset', async () => {
    const user = await createUser();
    const oldJwt = tokenFor(user);

    await reset({ token: await issueReset(user), newPassword: NEW_PASSWORD });

    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${oldJwt}`);
    expect(res.status).toBe(401);
  });

  it('o link só vale uma vez', async () => {
    const user = await createUser();
    const token = await issueReset(user);
    await reset({ token, newPassword: NEW_PASSWORD });

    const again = await reset({ token, newPassword: 'outra-senha-789' });

    expectInvalidToken(again);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('recusa o link expirado', async () => {
    const user = await createUser();
    const token = await issueReset(user);
    await AuthToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    expectInvalidToken(await reset({ token, newPassword: NEW_PASSWORD }));
    expect((await login(OLD_PASSWORD)).status).toBe(200);
  });

  it('recusa o token de ativação', async () => {
    const user = await createUser();
    const token = await authTokenService.issue({
      userId: user.id,
      type: 'activation',
      ttlMinutes: 1440,
    });

    expectInvalidToken(await reset({ token, newPassword: NEW_PASSWORD }));
  });

  it('recusa um token que nunca foi emitido', async () => {
    await createUser();

    expectInvalidToken(await reset({ token: 'f'.repeat(64), newPassword: NEW_PASSWORD }));
  });

  it('recusa o link de um usuário que foi excluído', async () => {
    const user = await createUser();
    const token = await issueReset(user);
    await User.deleteOne({ _id: user._id });

    expectInvalidToken(await reset({ token, newPassword: NEW_PASSWORD }));
  });

  // O usuário corrige a senha e tenta de novo com o mesmo link.
  it('com senha fora das regras, responde 400 sem gastar o link', async () => {
    const user = await createUser();
    const token = await issueReset(user);

    const weak = await reset({ token, newPassword: 'curta' });

    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    expect(weak.body.error.details).toHaveProperty('newPassword');
    expect((await reset({ token, newPassword: NEW_PASSWORD })).status).toBe(200);
  });

  it.each([
    ['sem token', { newPassword: NEW_PASSWORD }, 'token'],
    ['com token que não é texto', { token: { $ne: null }, newPassword: NEW_PASSWORD }, 'token'],
    ['sem a senha nova', { token: 'f'.repeat(64) }, 'newPassword'],
  ])('responde 400 %s', async (_why, body, field) => {
    const res = await reset(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty(field);
  });

  // Receber o link prova o e-mail, mas a ativação tem fluxo próprio (US-17).
  it('não ativa uma conta inativa', async () => {
    const user = await createUser({ isActive: false });

    await reset({ token: await issueReset(user), newPassword: NEW_PASSWORD });

    const res = await login(NEW_PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});
