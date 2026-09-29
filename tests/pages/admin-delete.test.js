const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const { createUser, tokenFor } = require('../helpers/auth');
const User = require('../../src/models/User');
const app = require('../../src/app');

const sessionOf = (user) => {
  const page = browser(app);
  page.cookies.set('access_token', tokenFor(user));
  return page;
};

const exists = async (user) => (await User.countDocuments({ _id: user._id })) === 1;

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('GET /admin/users/:id/delete', () => {
  it('pede confirmação com o username e o e-mail, sem excluir', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia', email: 'bia@example.com' });

    const res = await sessionOf(admin).get(`/admin/users/${bia.id}/delete`);

    expect(res.status).toBe(200);
    const text = textOf(res.text);
    expect(text).toContain('bia');
    expect(text).toContain('bia@example.com');
    expect(text).toContain('Excluir conta');
    expect(res.text).toContain('href="/admin"');
    expect(await exists(bia)).toBe(true);
  });

  it('guarda a busca e a página em campos ocultos e no Cancelar', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await sessionOf(admin).get(`/admin/users/${bia.id}/delete?search=bi&page=2`);

    expect(res.text).toContain('name="page" value="2"');
    expect(res.text).toContain('name="search" value="bi"');
    expect(res.text).toContain('href="/admin?search=bi&amp;page=2"');
  });

  it('conta inexistente: 404', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    expect((await sessionOf(admin).get(`/admin/users/${'0'.repeat(24)}/delete`)).status).toBe(404);
  });
});

describe('POST /admin/users/:id/delete', () => {
  const confirm = (admin, user, form = {}) =>
    sessionOf(admin).submit(`/admin/users/${user.id}/delete`, form, {
      from: `/admin/users/${user.id}/delete`,
    });

  it('exclui a conta e volta ao painel com o aviso', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await confirm(admin, bia);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin?done=deleted');
    expect(await exists(bia)).toBe(false);
  });

  it('volta para a mesma busca e página', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await confirm(admin, bia, { search: 'bi', page: '2' });

    expect(res.headers.location).toBe('/admin?search=bi&page=2&done=deleted');
  });

  it('não exclui o último admin ativo', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    const res = await confirm(admin, admin);

    expect(res.headers.location).toBe('/admin?error=last-admin');
    expect(await exists(admin)).toBe(true);
  });

  it('usuário comum: 403 e nada muda', async () => {
    const user = await createUser({ username: 'bia' });
    const other = await createUser({ username: 'caio' });

    const res = await sessionOf(user).submit(
      `/admin/users/${other.id}/delete`,
      {},
      { from: '/users' },
    );

    expect(res.status).toBe(403);
    expect(await exists(other)).toBe(true);
  });

  it('sem o token CSRF: 403 e nada muda', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });
    const page = sessionOf(admin);
    await page.get(`/admin/users/${bia.id}/delete`);

    const res = await page.post(`/admin/users/${bia.id}/delete`, {});

    expect(res.status).toBe(403);
    expect(await exists(bia)).toBe(true);
  });
});
