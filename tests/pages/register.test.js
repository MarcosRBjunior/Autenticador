const request = require('supertest');
const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const User = require('../../src/models/User');
const mailService = require('../../src/services/MailService');
const background = require('../../src/utils/background');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.30.0.${++lastIp}`;

const validForm = (overrides = {}) => ({
  username: 'ana',
  email: 'ana@example.com',
  password: 'senha-forte-123',
  passwordConfirmation: 'senha-forte-123',
  ...overrides,
});

// O e-mail de ativação sai depois da resposta: espera antes de limpar o banco.
const settled = () => Promise.all(background.run.mock.results.map((r) => r.value));

beforeAll(async () => {
  await db.connect();
  await User.init();
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

describe('GET /register', () => {
  it('mostra os quatro campos e as regras de senha', async () => {
    const res = await browser(app).get('/register');

    expect(res.status).toBe(200);
    for (const name of ['username', 'email', 'password', 'passwordConfirmation']) {
      expect(res.text).toContain(`name="${name}"`);
    }
    expect(textOf(res.text)).toContain('8 a 72 caracteres');
  });
});

describe('POST /register', () => {
  it('cria a conta inativa, manda o link e vai para o login com o aviso', async () => {
    const res = await browser(app, { ip: newIp() }).submit('/register', validForm());
    await settled();

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login?registered=1');
    const user = await User.findOne({ username: 'ana' }).lean();
    expect(user.isActive).toBe(false);
    expect(mailService.sendActivationEmail).toHaveBeenCalledTimes(1);
  });

  it('erros por campo, com os valores preenchidos e sem repetir a senha', async () => {
    const res = await browser(app, { ip: newIp() }).submit(
      '/register',
      validForm({
        username: 'a',
        email: 'nao-e-email',
        password: 'curta',
        passwordConfirmation: 'curta',
      }),
    );

    expect(res.status).toBe(400);
    const text = textOf(res.text);
    expect(text).toContain('O username deve ter pelo menos 3 caracteres');
    expect(text).toContain('E-mail inválido');
    expect(text).toContain('A senha deve ter pelo menos 8 caracteres');
    expect(res.text).toContain('value="nao-e-email"');
    expect(res.text).not.toContain('value="curta"');
  });

  it('senhas diferentes: erro na confirmação', async () => {
    const res = await browser(app, { ip: newIp() }).submit(
      '/register',
      validForm({ passwordConfirmation: 'outra-senha-456' }),
    );

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('As senhas não são iguais');
    await expect(User.countDocuments()).resolves.toBe(0);
  });

  it('username já usado: 409 com o erro no campo', async () => {
    await User.create({ username: 'ana', email: 'outra@example.com', password: 'senha-forte-123' });

    const res = await browser(app, { ip: newIp() }).submit('/register', validForm());

    expect(res.status).toBe(409);
    expect(textOf(res.text)).toContain('Este username já está em uso');
  });

  it('sem o token CSRF: 403 e nenhuma conta', async () => {
    const page = browser(app, { ip: newIp() });
    await page.get('/register');

    const res = await page.post('/register', validForm());

    expect(res.status).toBe(403);
    await expect(User.countDocuments()).resolves.toBe(0);
  });

  it('conta as tentativas junto com a API (10 por hora por IP)', async () => {
    const ip = newIp();
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/v1/register').set('X-Forwarded-For', ip).send({});
    }

    const res = await browser(app, { ip }).submit('/register', validForm());

    expect(res.status).toBe(429);
  });
});
