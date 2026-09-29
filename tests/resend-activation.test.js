const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const AuthToken = require('../src/models/AuthToken');
const authTokenService = require('../src/services/AuthTokenService');
const userRepository = require('../src/repositories/UserRepository');
const mailService = require('../src/services/MailService');
const background = require('../src/utils/background');
const { logger } = require('../src/utils/logger');
const app = require('../src/app');

// Um IP por teste (TRUST_PROXY=1 nos testes) para os limites não se somarem.
let lastIp = 0;
const newIp = () => `100.64.0.${++lastIp}`;

const send = (path, body, ip) => request(app).post(path).set('X-Forwarded-For', ip).send(body);

// A resposta sai antes do trabalho: espera as tarefas em segundo plano acabarem.
const settled = () => Promise.all(background.run.mock.results.map((result) => result.value));

async function resend(body, ip = newIp()) {
  const res = await send('/api/v1/auth/resend-activation', body, ip);
  await settled();
  return res;
}

const activate = (token) => send('/api/v1/auth/activate', { token }, newIp());

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    ...overrides,
  });

let sendActivationEmail;

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
beforeEach(() => {
  jest.spyOn(background, 'run');
  // Passa pelo MailService de verdade (jsonTransport nos testes).
  sendActivationEmail = jest.spyOn(mailService, 'sendActivationEmail');
});
afterEach(async () => {
  await settled();
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('POST /api/v1/auth/resend-activation', () => {
  it('para conta ainda não ativada, manda um link novo de 24 horas', async () => {
    const user = await createUser();

    const res = await resend({ email: ' ANA@Example.com ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: expect.any(String) });
    expect(sendActivationEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: user.id, email: 'ana@example.com' }),
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresInMinutes: 1440,
    });
  });

  it('o link novo invalida o anterior', async () => {
    const user = await createUser();
    const old = await authTokenService.issue({
      userId: user.id,
      type: 'activation',
      ttlMinutes: 1440,
    });

    await resend({ email: 'ana@example.com' });
    const [{ token }] = sendActivationEmail.mock.calls[0];

    expect((await activate(old)).status).toBe(400);
    expect((await activate(token)).status).toBe(200);
  });

  it('responde igual para conta ativa e e-mail sem conta, sem mandar nada', async () => {
    await createUser();
    await createUser({ username: 'bia', email: 'bia@example.com', isActive: true });
    const inactive = await resend({ email: 'ana@example.com' });
    sendActivationEmail.mockClear();

    const active = await resend({ email: 'bia@example.com' });
    const unknown = await resend({ email: 'ninguem@example.com' });

    for (const res of [active, unknown]) {
      expect(res.status).toBe(inactive.status);
      expect(res.body).toEqual(inactive.body);
    }
    expect(sendActivationEmail).not.toHaveBeenCalled();
  });

  it('responde sem esperar o envio do e-mail', async () => {
    await createUser();
    let finishSending;
    sendActivationEmail.mockReturnValue(
      new Promise((resolve) => {
        finishSending = () => resolve(true);
      }),
    );

    const res = await send('/api/v1/auth/resend-activation', { email: 'ana@example.com' }, newIp());

    expect(res.status).toBe(200);
    finishSending();
  });

  it('com falha no segundo plano, responde 200 igual e registra o erro', async () => {
    const dbDown = new Error('banco fora do ar');
    jest.spyOn(userRepository, 'findByEmail').mockRejectedValue(dbDown);
    const logError = jest.spyOn(logger, 'error');

    const res = await resend({ email: 'ana@example.com' });

    expect(res.status).toBe(200);
    expect(logError).toHaveBeenCalledWith(
      { err: dbDown, task: 'activation_resend' },
      expect.any(String),
    );
  });

  it('recusa e-mail inválido com 400, sem começar nada', async () => {
    const res = await resend({ email: 'nao-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('email');
    expect(background.run).not.toHaveBeenCalled();
  });

  describe('rate limit (5 pedidos em 15 min por IP + e-mail, 20 por hora por IP)', () => {
    it('bloqueia o 6º pedido para o mesmo e-mail', async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) {
        expect((await resend({ email: 'ana@example.com' }, ip)).status).toBe(200);
      }

      const blocked = await resend({ email: 'ana@example.com' }, ip);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('um IP faz no máximo 20 pedidos por hora, mesmo com e-mails diferentes', async () => {
      const ip = newIp();
      for (let i = 0; i < 20; i++) await resend({ email: `pessoa${i}@example.com` }, ip);

      const blocked = await resend({ email: 'mais.uma@example.com' }, ip);

      expect(blocked.status).toBe(429);
    });

    // Pedir o reset não gasta a cota do reenvio, e vice-versa.
    it('conta separado do "esqueci a senha"', async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) {
        await send('/api/v1/auth/forgot-password', { email: 'ana@example.com' }, ip);
      }

      const res = await resend({ email: 'ana@example.com' }, ip);

      expect(res.status).toBe(200);
    });
  });
});
