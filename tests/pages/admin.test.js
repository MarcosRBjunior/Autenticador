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

// Trecho <tr>…</tr> da linha de um usuário, para conferir as ações dela.
function rowOf(html, username) {
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  return rows.find((row) => row.includes(`>${username}<`)) ?? '';
}

const roleOf = async (user) => (await User.findById(user._id).lean()).role;

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('GET /admin', () => {
  it('sem login, vai para o /login', async () => {
    const res = await browser(app).get('/admin');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('usuário comum recebe a página 403', async () => {
    const res = await sessionOf(await createUser()).get('/admin');

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('Sem permissão');
  });

  it('mostra os contadores de usuários, admins e inativos', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    await createUser({ username: 'bia' });
    await createUser({ username: 'caio', isActive: false });

    const text = textOf((await sessionOf(admin).get('/admin')).text);

    expect(text).toContain('3 usuários');
    expect(text).toContain('1 admin ');
    expect(text).toContain('1 inativo');
  });

  it('lista as contas com e-mail, perfil, status e ações', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    await createUser({ username: 'bia', email: 'bia@example.com', isActive: false });
    await createUser({ username: 'dora', role: 'admin' });

    const html = (await sessionOf(admin).get('/admin')).text;

    const bia = rowOf(html, 'bia');
    expect(bia).toContain('bia@example.com');
    expect(bia).toContain('inativo');
    expect(bia).toContain('Tornar admin');
    expect(bia).toContain('Editar');
    expect(bia).toContain('Excluir');
    expect(rowOf(html, 'dora')).toContain('Tornar usuário');
  });

  // Ninguém se tranca fora do painel por engano.
  it('a própria linha não tem "Tornar usuário" nem "Excluir"', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    const own = rowOf((await sessionOf(admin).get('/admin')).text, 'root');

    expect(own).toContain('(você)');
    expect(own).toContain('Editar');
    expect(own).not.toContain('Tornar usuário');
    expect(own).not.toContain('Excluir');
  });

  it('busca por username', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    await createUser({ username: 'bia' });
    await createUser({ username: 'caio' });

    const html = (await sessionOf(admin).get('/admin?search=bi')).text;

    expect(rowOf(html, 'bia')).not.toBe('');
    expect(rowOf(html, 'caio')).toBe('');
  });

  it('as ações da linha levam a busca e a página atuais', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const row = rowOf((await sessionOf(admin).get('/admin?search=bi')).text, 'bia');

    expect(row).toContain(`href="/admin/users/${bia.id}/edit?search=bi"`);
    expect(row).toContain(`href="/admin/users/${bia.id}/delete?search=bi"`);
    expect(row).toContain('name="search" value="bi"');
  });

  it.each([
    ['done=role', 'Perfil alterado.'],
    ['done=updated', 'Usuário atualizado.'],
    ['done=deleted', 'Usuário excluído.'],
    ['error=last-admin', 'Não é possível remover o último admin.'],
  ])('mostra o aviso de ?%s', async (query, message) => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    expect(textOf((await sessionOf(admin).get(`/admin?${query}`)).text)).toContain(message);
  });

  it.each(['<b>x</b>', '__proto__', 'constructor'])(
    'não mostra aviso para ?done=%s',
    async (value) => {
      const admin = await createUser({ username: 'root', role: 'admin' });

      const res = await sessionOf(admin).get(`/admin?done=${encodeURIComponent(value)}`);

      expect(res.text).not.toContain('role="status"');
      expect(res.text).not.toContain('[object');
      expect(res.text).not.toContain('<b>x</b>');
    },
  );
});

describe('GET /admin com várias páginas', () => {
  // 22 contas (o admin e mais 21, na ordem de criação): a página 2 tem duas
  // contas comuns, com todas as ações.
  async function withTwoPages() {
    const admin = await createUser({ username: 'root', role: 'admin' });
    for (let i = 0; i < 21; i += 1) await createUser();
    return admin;
  }

  it('a página 2 tem o pager e as ações levam page=2', async () => {
    const admin = await withTwoPages();

    const html = (await sessionOf(admin).get('/admin?page=2')).text;

    expect(html).toContain('<span aria-current="page">2</span>');
    expect(html).toMatch(/href="\/admin\/users\/[a-f0-9]{24}\/edit\?page=2"/);
    expect(html).toMatch(/href="\/admin\/users\/[a-f0-9]{24}\/delete\?page=2"/);
    expect(html).toContain('<input type="hidden" name="page" value="2" />');
  });

  it('depois da última página, vai para a última mantendo o aviso', async () => {
    const admin = await withTwoPages();
    const page = sessionOf(admin);

    const res = await page.get('/admin?page=9&done=deleted');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin?page=2&done=deleted');
    const followed = await page.get(res.headers.location);
    expect(textOf(followed.text)).toContain('Usuário excluído.');
  });

  it('mantém a busca ao voltar para a última página', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    for (let i = 0; i < 21; i += 1) await createUser({ username: `ana${i}` });

    const res = await sessionOf(admin).get('/admin?search=ana&page=9&error=last-admin');

    expect(res.headers.location).toBe('/admin?search=ana&page=2&error=last-admin');
  });

  it('não leva um código desconhecido para o redirecionamento', async () => {
    const admin = await withTwoPages();

    const res = await sessionOf(admin).get(
      `/admin?page=9&done=${encodeURIComponent('<script>')}&error=__proto__`,
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin?page=2');
  });
});

describe('usuário comum em todas as rotas do painel', () => {
  it.each([
    ['GET', '/admin'],
    ['POST', '/admin/users/:id/role'],
    ['GET', '/admin/users/:id/edit'],
    ['POST', '/admin/users/:id'],
    ['GET', '/admin/users/:id/delete'],
    ['POST', '/admin/users/:id/delete'],
  ])('%s %s: 403 e nada muda', async (method, route) => {
    const user = await createUser({ username: 'bia' });
    const target = await createUser({ username: 'caio' });
    const path = route.replace(':id', target.id);
    const page = sessionOf(user);

    let res;
    if (method === 'GET') {
      res = await page.get(path);
    } else {
      // Token CSRF válido: o 403 tem de vir do isAdmin, não do CSRF.
      res = await page.submit(path, { role: 'admin', username: 'novo' }, { from: '/users' });
    }

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('Sem permissão');
    const after = await User.findById(target._id).lean();
    expect(after).not.toBeNull();
    expect(after.role).toBe('user');
    expect(after.username).toBe('caio');
  });
});

describe('POST /admin/users/:id/role', () => {
  it('promove a conta e volta ao painel com o aviso', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await sessionOf(admin).submit(
      `/admin/users/${bia.id}/role`,
      { role: 'admin' },
      { from: '/admin' },
    );

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin?done=role');
    expect(await roleOf(bia)).toBe('admin');
  });

  it('volta para a mesma busca e página', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });

    const res = await sessionOf(admin).submit(
      `/admin/users/${bia.id}/role`,
      { role: 'admin', search: 'bi', page: '2' },
      { from: '/admin' },
    );

    expect(res.headers.location).toBe('/admin?search=bi&page=2&done=role');
  });

  it('não rebaixa o último admin ativo', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    const res = await sessionOf(admin).submit(
      `/admin/users/${admin.id}/role`,
      { role: 'user' },
      { from: '/admin' },
    );

    expect(res.headers.location).toBe('/admin?error=last-admin');
    expect(await roleOf(admin)).toBe('admin');
  });

  it('usuário comum recebe 403 e nada muda', async () => {
    const user = await createUser({ username: 'bia' });
    const other = await createUser({ username: 'caio' });

    const res = await sessionOf(user).submit(
      `/admin/users/${other.id}/role`,
      { role: 'admin' },
      { from: '/users' },
    );

    expect(res.status).toBe(403);
    expect(await roleOf(other)).toBe('user');
  });

  it('sem o token CSRF: 403 e nada muda', async () => {
    const admin = await createUser({ username: 'root', role: 'admin' });
    const bia = await createUser({ username: 'bia' });
    const page = sessionOf(admin);
    await page.get('/admin');

    const res = await page.post(`/admin/users/${bia.id}/role`, { role: 'admin' });

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('A página expirou');
    expect(await roleOf(bia)).toBe('user');
  });

  it.each([['0'.repeat(24)], ['abc']])('conta %s inexistente: 404', async (id) => {
    const admin = await createUser({ username: 'root', role: 'admin' });

    const res = await sessionOf(admin).submit(
      `/admin/users/${id}/role`,
      { role: 'admin' },
      { from: '/admin' },
    );

    expect(res.status).toBe(404);
  });
});
