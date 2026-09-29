const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const AuthToken = require('../src/models/AuthToken');
const authTokenService = require('../src/services/AuthTokenService');
const mailService = require('../src/services/MailService');
const background = require('../src/utils/background');
const app = require('../src/app');

// Um IP por chamada (TRUST_PROXY=1 nos testes) para os limites não somarem.
let lastIp = 0;
const newIp = () => `198.18.0.${++lastIp}`;

const PASSWORD = 'senha-forte-123';

const activate = (body, ip = newIp()) =>
  request(app).post('/api/v1/auth/activate').set('X-Forwarded-For', ip).send(body);

const login = () =>
  request(app)
    .post('/api/v1/login')
    .set('X-Forwarded-For', newIp())
    .send({ username: 'ana', password: PASSWORD });

// Nasce inativa, como no cadastro.
const createUser = () =>
  User.create({ username: 'ana', email: 'ana@example.com', password: PASSWORD });

const issueActivation = (user) =>
  authTokenService.issue({ userId: user.id, type: 'activation', ttlMinutes: 1440 });

const isActive = async () => (await User.findOne({ username: 'ana' }).lean()).isActive;

const expectInvalidLink = (res) => {
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

describe('POST /api/v1/auth/activate', () => {
  it('com o link recebido no cadastro, ativa a conta e o login passa a funcionar', async () => {
    const run = jest.spyOn(background, 'run');
    const sendActivationEmail = jest.spyOn(mailService, 'sendActivationEmail');
    await request(app)
      .post('/api/v1/register')
      .set('X-Forwarded-For', newIp())
      .send({ username: 'ana', email: 'ana@example.com', password: PASSWORD });
    await run.mock.results[0].value;
    const [{ token }] = sendActivationEmail.mock.calls[0];
    expect((await login()).status).toBe(403);

    const res = await activate({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: expect.any(String) });
    expect((await login()).status).toBe(200);
  });

  it('o link só vale uma vez', async () => {
    const token = await issueActivation(await createUser());
    await activate({ token });

    expectInvalidLink(await activate({ token }));
  });

  it('recusa o link expirado, e a conta continua inativa', async () => {
    const token = await issueActivation(await createUser());
    await AuthToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    expectInvalidLink(await activate({ token }));
    expect(await isActive()).toBe(false);
  });

  it('recusa o token de reset de senha', async () => {
    const user = await createUser();
    const token = await authTokenService.issue({
      userId: user.id,
      type: 'password_reset',
      ttlMinutes: 30,
    });

    expectInvalidLink(await activate({ token }));
    expect(await isActive()).toBe(false);
  });

  it('recusa um token que nunca foi emitido', async () => {
    await createUser();

    expectInvalidLink(await activate({ token: 'f'.repeat(64) }));
  });

  it('recusa o link de um usuário que foi excluído', async () => {
    const user = await createUser();
    const token = await issueActivation(user);
    await User.deleteOne({ _id: user._id });

    expectInvalidLink(await activate({ token }));
  });

  it.each([
    ['sem token', {}],
    ['com token que não é texto', { token: { $ne: null } }],
  ])('responde 400 %s', async (_why, body) => {
    const res = await activate(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('token');
  });

  // O link antigo era um GET na API: scanners de link ativariam a conta sozinhos.
  it('o GET com o token na rota não ativa a conta', async () => {
    const token = await issueActivation(await createUser());

    const res = await request(app).get(`/api/v1/auth/activate/${token}`);

    expect(res.status).toBe(401);
    expect(await isActive()).toBe(false);
  });

  it('bloqueia o 11º pedido do mesmo IP em 15 min', async () => {
    const ip = newIp();
    for (let i = 0; i < 10; i++) expectInvalidLink(await activate({ token: 'f'.repeat(64) }, ip));

    const blocked = await activate({ token: 'f'.repeat(64) }, ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
