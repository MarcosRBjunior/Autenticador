const request = require('supertest');
const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const User = require('../../src/models/User');
const AuthToken = require('../../src/models/AuthToken');
const authTokenService = require('../../src/services/AuthTokenService');
const mailService = require('../../src/services/MailService');
const background = require('../../src/utils/background');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.50.0.${++lastIp}`;
const NEW_PASSWORD = 'senha-nova-456';

const createUser = () =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-antiga-123',
    isActive: true,
  });
const issueReset = (user) =>
  authTokenService.issue({ userId: user.id, type: 'password_reset', ttlMinutes: 30 });
const loginStatus = (password) =>
  request(app)
    .post('/api/v1/login')
    .set('X-Forwarded-For', newIp())
    .send({ username: 'ana', password })
    .then((res) => res.status);

const settled = () => Promise.all(background.run.mock.results.map((r) => r.value));

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
beforeEach(() => {
  jest.spyOn(background, 'run');
  jest.spyOn(mailService, 'sendPasswordResetEmail');
});
afterEach(async () => {
  await settled();
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('/forgot-password', () => {
  it('manda o link e volta com o aviso genérico', async () => {
    await createUser();
    const page = browser(app, { ip: newIp() });

    const res = await page.submit('/forgot-password', { email: 'ana@example.com' });
    await settled();

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/forgot-password?sent=1');
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(textOf((await page.get(res.headers.location)).text)).toContain(
      'Se o e-mail estiver cadastrado',
    );
  });

  it('o mesmo redirect para e-mail sem conta, sem mandar nada', async () => {
    const res = await browser(app, { ip: newIp() }).submit('/forgot-password', {
      email: 'ninguem@example.com',
    });
    await settled();

    expect(res.headers.location).toBe('/forgot-password?sent=1');
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('e-mail inválido: 400 com o erro no campo', async () => {
    const res = await browser(app, { ip: newIp() }).submit('/forgot-password', { email: 'x' });

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('E-mail inválido');
  });
});

describe('/reset-password', () => {
  const resetFrom = (token) => ({ from: `/reset-password?token=${token}` });

  it('troca a senha e leva ao login com o aviso', async () => {
    const token = await issueReset(await createUser());

    const res = await browser(app, { ip: newIp() }).submit(
      '/reset-password',
      { token, newPassword: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      resetFrom(token),
    );

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login?reset=1');
    expect(await loginStatus(NEW_PASSWORD)).toBe(200);
  });

  it('senha fora das regras: erro no campo e o link continua valendo', async () => {
    const token = await issueReset(await createUser());
    const page = browser(app, { ip: newIp() });

    const weak = await page.submit(
      '/reset-password',
      { token, newPassword: 'curta', passwordConfirmation: 'curta' },
      resetFrom(token),
    );

    expect(weak.status).toBe(400);
    expect(textOf(weak.text)).toContain('A senha deve ter pelo menos 8 caracteres');
    expect(weak.text).toContain(`value="${token}"`);
    const ok = await page.submit(
      '/reset-password',
      { token, newPassword: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      resetFrom(token),
    );
    expect(ok.status).toBe(303);
  });

  it('senhas diferentes: erro na confirmação', async () => {
    const token = await issueReset(await createUser());

    const res = await browser(app, { ip: newIp() }).submit(
      '/reset-password',
      { token, newPassword: NEW_PASSWORD, passwordConfirmation: 'outra-senha-789' },
      resetFrom(token),
    );

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('As senhas não são iguais');
  });

  it('link inválido: 400 com o botão para pedir outro', async () => {
    await createUser();
    const token = 'f'.repeat(64);

    const res = await browser(app, { ip: newIp() }).submit(
      '/reset-password',
      { token, newPassword: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      resetFrom(token),
    );

    expect(res.status).toBe(400);
    expect(res.text).toContain('href="/forgot-password"');
    expect(await loginStatus('senha-antiga-123')).toBe(200);
  });

  it('sem token na URL: aviso de link inválido', async () => {
    const res = await browser(app).get('/reset-password');

    expect(res.status).toBe(400);
    expect(res.text).toContain('href="/forgot-password"');
  });
});
