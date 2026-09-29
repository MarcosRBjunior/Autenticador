const request = require('supertest');
const db = require('../helpers/db');
const { createUser, tokenFor } = require('../helpers/auth');
const app = require('../../src/app');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

const withSession = (req, user) => req.set('Cookie', `access_token=${tokenFor(user)}`);

describe('arquivos públicos', () => {
  it.each([
    ['/css/app.css', /text\/css/],
    ['/js/password-toggle.js', /javascript/],
    ['/fonts/Outfit-Bold.woff2', /font\/woff2/],
  ])('serve %s sem login', async (path, type) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(type);
  });
});

describe('páginas sem sessão', () => {
  it('a raiz leva ao login', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('página protegida leva ao login', async () => {
    const res = await request(app).get('/qualquer-pagina');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('com sessão inválida, apaga o cookie e leva ao login', async () => {
    const res = await request(app).get('/qualquer-pagina').set('Cookie', 'access_token=lixo');

    expect(res.headers.location).toBe('/login');
    const cleared = res.headers['set-cookie'].find((c) => c.startsWith('access_token='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  // A API não muda: 401 em JSON.
  it('a API continua respondendo 401 em JSON', async () => {
    const res = await request(app).get('/api/v1/nada');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('páginas com sessão', () => {
  it('a raiz leva à lista de usuários', async () => {
    const user = await createUser();

    const res = await withSession(request(app).get('/'), user);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/users');
  });

  it('página inexistente: 404 em HTML, sem cache', async () => {
    const user = await createUser();

    const res = await withSession(request(app).get('/pagina-inexistente'), user);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Página não encontrada');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
