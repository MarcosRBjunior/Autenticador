const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const { createUser, tokenFor } = require('../helpers/auth');
const app = require('../../src/app');

const sessionOf = (user) => {
  const page = browser(app);
  page.cookies.set('access_token', tokenFor(user));
  return page;
};

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('GET /users', () => {
  it('sem login, leva ao /login', async () => {
    const res = await browser(app).get('/users');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('usuário comum vê username e data, sem e-mail, perfil nem status (D-08)', async () => {
    const viewer = await createUser({ username: 'ana', email: 'ana@example.com' });
    await createUser({ username: 'bia', email: 'bia@example.com', role: 'admin' });

    const res = await sessionOf(viewer).get('/users');

    expect(res.status).toBe(200);
    const text = textOf(res.text);
    expect(text).toContain('bia');
    expect(text).toContain('Desde');
    expect(text).not.toContain('bia@example.com');
    expect(res.text).not.toContain('gl-badge');
    expect(res.text).not.toContain('href="/admin"');
  });

  it('admin vê e-mail, perfil, status e o link do painel', async () => {
    const viewer = await createUser({ username: 'root', role: 'admin' });
    await createUser({ username: 'bia', email: 'bia@example.com', isActive: false });

    const res = await sessionOf(viewer).get('/users');

    const text = textOf(res.text);
    expect(text).toContain('bia@example.com');
    expect(text).toContain('inativo');
    expect(res.text).toContain('href="/admin"');
  });

  it('busca por username e mostra o termo escapado', async () => {
    const viewer = await createUser({ username: 'ana' });
    await createUser({ username: 'bruno' });

    const res = await sessionOf(viewer).get('/users?search=<script>');

    expect(res.text).not.toContain('<script>');
    expect(res.text).toContain('&lt;script&gt;');
    expect(textOf(res.text)).toContain('Nenhum usuário encontrado');
  });

  it('pagina de 20 em 20, mantendo a busca nos links', async () => {
    const viewer = await createUser({ username: 'viewer' });
    for (let i = 0; i < 24; i++) await createUser({ username: `pessoa${i}` });

    const res = await sessionOf(viewer).get('/users?search=pessoa&page=2');

    expect((res.text.match(/class="gl-user /g) ?? []).length).toBe(4);
    expect(res.text).toContain('href="/users?search=pessoa&amp;page=1"');
  });

  it('página inválida volta para a primeira', async () => {
    const viewer = await createUser({ username: 'ana' });

    const res = await sessionOf(viewer).get('/users?page=abc');

    expect(res.status).toBe(200);
    expect(textOf(res.text)).toContain('ana');
  });

  it('não fica em cache', async () => {
    const viewer = await createUser();

    const res = await sessionOf(viewer).get('/users');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('a barra tem o formulário de sair com o token CSRF', async () => {
    const viewer = await createUser();

    const res = await sessionOf(viewer).get('/users');

    expect(res.text).toMatch(/<form[^>]*method="post"[^>]*action="\/logout"/);
    expect(res.text).toContain('name="_csrf"');
  });
});
