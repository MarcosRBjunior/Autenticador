const request = require('supertest');
const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const { createUser, tokenFor } = require('../helpers/auth');
const User = require('../../src/models/User');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.60.0.${++lastIp}`;

const sessionOf = (user) => {
  const page = browser(app);
  page.cookies.set('access_token', tokenFor(user));
  return page;
};

const editOf = (admin, user, form, from = `/admin/users/${user.id}/edit`) =>
  sessionOf(admin).submit(`/admin/users/${user.id}`, form, { from });

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('GET /admin/users/:id/edit', () => {
  it('mostra o username atual e a senha em branco', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await sessionOf(admin).get(`/admin/users/${bia.id}/edit`);

    expect(res.status).toBe(200);
    expect(textOf(res.text)).toContain('Editar bia');
    expect(res.text).toContain('value="bia"');
    expect(res.text).toContain('name="password"');
  });

  it('guarda a busca e a página em campos ocultos e no link de voltar', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await sessionOf(admin).get(`/admin/users/${bia.id}/edit?search=bi&page=2`);

    expect(res.text).toContain('name="page" value="2"');
    expect(res.text).toContain('name="search" value="bi"');
    expect(res.text).toContain('href="/admin?search=bi&amp;page=2"');
  });

  it('conta inexistente: 404', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    const res = await sessionOf(admin).get(`/admin/users/${'0'.repeat(24)}/edit`);

    expect(res.status).toBe(404);
  });

  it('usuário comum: 403', async () => {
    const user = await createUser({ username: 'bia' });

    const res = await sessionOf(user).get(`/admin/users/${user.id}/edit`);

    expect(res.status).toBe(403);
  });
});

describe('POST /admin/users/:id', () => {
  it('troca o username e volta ao painel com o aviso', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await editOf(admin, bia, { username: 'beatriz', password: '' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin?done=updated');
    expect((await User.findById(bia._id).lean()).username).toBe('beatriz');
  });

  it('com senha nova, a conta passa a entrar com ela', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    await editOf(admin, bia, { username: 'bia', password: 'senha-nova-456' });

    const login = await request(app)
      .post('/api/v1/login')
      .set('X-Forwarded-For', newIp())
      .send({ username: 'bia', password: 'senha-nova-456' });
    expect(login.status).toBe(200);
  });

  it('senha em branco mantém a senha atual', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });
    const before = (await User.findById(bia._id).select('+password').lean()).password;

    await editOf(admin, bia, { username: 'bia', password: '' });

    expect((await User.findById(bia._id).select('+password').lean()).password).toBe(before);
  });

  it('username inválido: 400 com o erro no campo e o valor digitado', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await editOf(admin, bia, { username: 'x', password: '' });

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('O username deve ter pelo menos 3 caracteres');
    expect(textOf(res.text)).toContain('Editar bia');
    expect(res.text).toContain('value="x"');
  });

  it('username já usado: 409 com o erro no campo', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });
    await createUser({ username: 'caio' });

    const res = await editOf(admin, bia, { username: 'caio', password: '' });

    expect(res.status).toBe(409);
    expect(textOf(res.text)).toContain('Este username já está em uso');
  });

  it('senha fora das regras: 400 sem repetir a senha', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await editOf(admin, bia, { username: 'bia', password: 'curta' });

    expect(res.status).toBe(400);
    expect(textOf(res.text)).toContain('A senha deve ter pelo menos 8 caracteres');
    expect(res.text).not.toContain('value="curta"');
  });

  it('volta para a mesma busca e página', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await editOf(admin, bia, {
      username: 'bia',
      password: '',
      search: 'bi',
      page: '2',
    });

    expect(res.headers.location).toBe('/admin?search=bi&page=2&done=updated');
  });

  it('sem o token CSRF: 403 e nada muda', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });
    const page = sessionOf(admin);
    await page.get(`/admin/users/${bia.id}/edit`);

    const res = await page.post(`/admin/users/${bia.id}`, { username: 'beatriz' });

    expect(res.status).toBe(403);
    expect((await User.findById(bia._id).lean()).username).toBe('bia');
  });
});
