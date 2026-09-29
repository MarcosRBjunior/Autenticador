const request = require('supertest');
const db = require('../helpers/db');
const { browser, csrfFrom, textOf } = require('../helpers/browser');
const { tokenFor } = require('../helpers/auth');
const User = require('../../src/models/User');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.20.0.${++lastIp}`;
const PASSWORD = 'senha-forte-123';

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: PASSWORD,
    isActive: true,
    ...overrides,
  });

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('GET /login', () => {
  it('declara um favicon vazio para o navegador não pedir /favicon.ico', async () => {
    const res = await browser(app).get('/login');

    expect(res.text).toContain('rel="icon"');
  });

  it('mostra o formulário com o token CSRF', async () => {
    const res = await browser(app).get('/login');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('name="password"');
    expect(() => csrfFrom(res.text)).not.toThrow();
  });

  it.each([
    ['registered', 'Enviamos um link de ativação'],
    ['activated', 'Conta ativada'],
    ['reset', 'Senha redefinida'],
  ])('mostra o aviso de ?%s=1', async (flag, text) => {
    const res = await browser(app).get(`/login?${flag}=1`);

    expect(textOf(res.text)).toContain(text);
  });

  it('não repete na página o texto que veio na URL', async () => {
    const res = await browser(app).get('/login?registered=<b>oi</b>');

    expect(res.text).not.toContain('<b>oi</b>');
  });

  it('quem já está logado vai para /users', async () => {
    const user = await createUser();
    const page = browser(app);
    page.cookies.set('access_token', tokenFor(user));

    const res = await page.get('/login');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/users');
  });
});

describe('POST /login', () => {
  it('com usuário e senha certos, grava a sessão e vai para /users', async () => {
    await createUser();
    const page = browser(app, { ip: newIp() });

    const res = await page.submit('/login', { username: 'ana', password: PASSWORD });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/users');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('access_token='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect((await page.get('/')).headers.location).toBe('/users');
  });

  it('aceita o e-mail no lugar do username', async () => {
    await createUser();

    const res = await browser(app, { ip: newIp() }).submit('/login', {
      username: 'ana@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(303);
  });

  it('senha errada: 401 genérico, mantém o usuário e não repete a senha', async () => {
    await createUser();

    const res = await browser(app, { ip: newIp() }).submit('/login', {
      username: 'ana',
      password: 'senha-errada-999',
    });

    expect(res.status).toBe(401);
    expect(textOf(res.text)).toContain('Usuário ou senha inválidos');
    expect(res.text).toContain('value="ana"');
    expect(res.text).not.toContain('senha-errada-999');
  });

  it('conta inativa: 403 com o link para reenviar a ativação', async () => {
    await createUser({ isActive: false });

    const res = await browser(app, { ip: newIp() }).submit('/login', {
      username: 'ana',
      password: PASSWORD,
    });

    expect(res.status).toBe(403);
    expect(res.text).toContain('href="/resend-activation"');
  });

  it('campos vazios: 400', async () => {
    const res = await browser(app, { ip: newIp() }).submit('/login', {
      username: '',
      password: '',
    });

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('Informe o usuário ou e-mail e a senha');
  });

  it('sem o token CSRF: 403 e nenhuma sessão', async () => {
    await createUser();
    const page = browser(app, { ip: newIp() });
    await page.get('/login');

    const res = await page.post('/login', { username: 'ana', password: PASSWORD });

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('A página expirou');
    expect(page.cookies.has('access_token')).toBe(false);
  });

  // Mesmo contador da API: ninguém dobra as tentativas usando a tela.
  it('conta as tentativas junto com a API', async () => {
    await createUser();
    const ip = newIp();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/login')
        .set('X-Forwarded-For', ip)
        .send({ username: 'ana', password: 'errada' });
    }

    const res = await browser(app, { ip }).submit('/login', {
      username: 'ana',
      password: PASSWORD,
    });

    expect(res.status).toBe(429);
    expect(textOf(res.text)).toContain('Muitas tentativas');
  });

  // Só as páginas leem formulário: a API segue aceitando só JSON.
  it('a API de login não aceita formulário', async () => {
    await createUser();

    const res = await request(app)
      .post('/api/v1/login')
      .type('form')
      .send({ username: 'ana', password: PASSWORD });

    expect(res.status).toBe(400);
  });
});
