const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const AuthToken = require('../src/models/AuthToken');
const userRepository = require('../src/repositories/UserRepository');
const mailService = require('../src/services/MailService');
const background = require('../src/utils/background');
const { logger } = require('../src/utils/logger');
const app = require('../src/app');

// Um IP por teste (TRUST_PROXY=1 nos testes) para os limites não se somarem.
let lastIp = 0;
const newIp = () => `198.51.100.${++lastIp}`;

const send = (body, ip = newIp()) =>
  request(app).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', ip).send(body);

// A resposta sai antes do trabalho: espera as tarefas em segundo plano acabarem.
const settled = () => Promise.all(background.run.mock.results.map((result) => result.value));

async function forgot(body, ip) {
  const res = await send(body, ip);
  await settled();
  return res;
}

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    isActive: true,
    ...overrides,
  });

let sendResetEmail;

beforeAll(db.connect);
beforeEach(() => {
  jest.spyOn(background, 'run');
  // Passa pelo MailService de verdade (jsonTransport nos testes).
  sendResetEmail = jest.spyOn(mailService, 'sendPasswordResetEmail');
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('POST /api/v1/auth/forgot-password', () => {
  it('responde 200 e manda o link de reset para o e-mail cadastrado', async () => {
    const user = await createUser();

    const res = await forgot({ email: ' ANA@Example.com ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: expect.any(String) });
    expect(sendResetEmail).toHaveBeenCalledTimes(1);
    expect(sendResetEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: user.id, email: 'ana@example.com' }),
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresInMinutes: 30,
    });
    await expect(
      AuthToken.countDocuments({ userId: user._id, type: 'password_reset' }),
    ).resolves.toBe(1);
  });

  it('responde igual para e-mail não cadastrado, sem criar token nem mandar nada', async () => {
    await createUser();
    const known = await forgot({ email: 'ana@example.com' });
    sendResetEmail.mockClear();

    const unknown = await forgot({ email: 'ninguem@example.com' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(sendResetEmail).not.toHaveBeenCalled();
    await expect(AuthToken.countDocuments()).resolves.toBe(1);
  });

  // O reset troca a senha, mas não ativa a conta: o login continua pedindo a ativação.
  it('também manda o link para conta ainda não ativada', async () => {
    await createUser({ isActive: false });

    await forgot({ email: 'ana@example.com' });

    expect(sendResetEmail).toHaveBeenCalledTimes(1);
  });

  // Esperar o SMTP denunciaria pelo tempo de resposta quais e-mails têm conta.
  it('responde sem esperar o envio do e-mail', async () => {
    await createUser();
    let finishSending;
    sendResetEmail.mockReturnValue(
      new Promise((resolve) => {
        finishSending = () => resolve(true);
      }),
    );

    const res = await send({ email: 'ana@example.com' });

    expect(res.status).toBe(200);
    finishSending();
    await settled();
    expect(sendResetEmail).toHaveBeenCalledTimes(1);
  });

  it('com falha no segundo plano, responde 200 igual e registra o erro', async () => {
    const dbDown = new Error('banco fora do ar');
    jest.spyOn(userRepository, 'findByEmail').mockRejectedValue(dbDown);
    const logError = jest.spyOn(logger, 'error');

    const res = await forgot({ email: 'ana@example.com' });

    expect(res.status).toBe(200);
    expect(logError).toHaveBeenCalledWith(
      { err: dbDown, task: 'password_reset_request' },
      expect.any(String),
    );
  });

  it('recusa e-mail inválido com 400, sem começar nada', async () => {
    const res = await forgot({ email: 'nao-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('email');
    expect(background.run).not.toHaveBeenCalled();
  });

  describe('rate limit (5 pedidos em 15 min por IP + e-mail)', () => {
    it('bloqueia o 6º pedido', async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) {
        expect((await forgot({ email: 'ana@example.com' }, ip)).status).toBe(200);
      }

      const blocked = await forgot({ email: 'ana@example.com' }, ip);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('conta separado para cada e-mail no mesmo IP', async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) await forgot({ email: 'outra@example.com' }, ip);

      const res = await forgot({ email: 'ANA@example.com' }, ip);

      expect(res.status).toBe(200);
    });

    it('trata maiúsculas e espaços como o mesmo e-mail', async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) await forgot({ email: 'ana@example.com' }, ip);

      const blocked = await forgot({ email: ' ANA@Example.COM ' }, ip);

      expect(blocked.status).toBe(429);
    });
  });
});
