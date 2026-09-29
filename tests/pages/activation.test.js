const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const User = require('../../src/models/User');
const AuthToken = require('../../src/models/AuthToken');
const authTokenService = require('../../src/services/AuthTokenService');
const mailService = require('../../src/services/MailService');
const background = require('../../src/utils/background');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.40.0.${++lastIp}`;

const createUser = () =>
  User.create({ username: 'ana', email: 'ana@example.com', password: 'senha-forte-123' });
const issueActivation = (user) =>
  authTokenService.issue({ userId: user.id, type: 'activation', ttlMinutes: 1440 });
const isActive = async () => (await User.findOne({ username: 'ana' }).lean()).isActive;

const settled = () => Promise.all(background.run.mock.results.map((r) => r.value));

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
beforeEach(() => {
  jest.spyOn(background, 'run');
  jest.spyOn(mailService, 'sendActivationEmail');
});
afterEach(async () => {
  await settled();
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('/activate', () => {
  // Scanners de link abrem o GET sozinhos: só o botão (POST) ativa.
  it('o GET mostra o botão e não ativa a conta', async () => {
    const token = await issueActivation(await createUser());

    const res = await browser(app).get(`/activate?token=${token}`);

    expect(res.status).toBe(200);
    expect(textOf(res.text)).toContain('Ativar minha conta');
    expect(res.text).toContain(`value="${token}"`);
    expect(await isActive()).toBe(false);
  });

  it('o botão ativa a conta e leva ao login com o aviso', async () => {
    const token = await issueActivation(await createUser());

    const res = await browser(app, { ip: newIp() }).submit(
      '/activate',
      { token },
      { from: `/activate?token=${token}` },
    );

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login?activated=1');
    expect(await isActive()).toBe(true);
  });

  it('link inválido: 400 com o link para pedir outro', async () => {
    await createUser();

    const res = await browser(app, { ip: newIp() }).submit(
      '/activate',
      { token: 'f'.repeat(64) },
      { from: `/activate?token=${'f'.repeat(64)}` },
    );

    expect(res.status).toBe(400);
    expect(res.text).toContain('href="/resend-activation"');
    expect(await isActive()).toBe(false);
  });

  it('sem token na URL: aviso de link inválido', async () => {
    const res = await browser(app).get('/activate');

    expect(res.status).toBe(400);
    expect(res.text).toContain('href="/resend-activation"');
  });

  it('sem o token CSRF: 403 e a conta segue inativa', async () => {
    const token = await issueActivation(await createUser());
    const page = browser(app, { ip: newIp() });
    await page.get(`/activate?token=${token}`);

    const res = await page.post('/activate', { token });

    expect(res.status).toBe(403);
    expect(await isActive()).toBe(false);
  });
});

describe('/resend-activation', () => {
  it('manda um link novo e volta com o aviso genérico', async () => {
    await createUser();
    const page = browser(app, { ip: newIp() });

    const res = await page.submit('/resend-activation', { email: 'ana@example.com' });
    await settled();

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/resend-activation?sent=1');
    expect(mailService.sendActivationEmail).toHaveBeenCalledTimes(1);
    expect(textOf((await page.get(res.headers.location)).text)).toContain(
      'você vai receber um novo link',
    );
  });

  it('e-mail inválido: 400 com o erro no campo', async () => {
    const res = await browser(app, { ip: newIp() }).submit('/resend-activation', { email: 'x' });

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('E-mail inválido');
    expect(background.run).not.toHaveBeenCalled();
  });
});
