# US-19: painel admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/admin` com contadores e a tabela de contas (editar, mudar perfil, excluir com confirmação), mais o "Sair" por POST com CSRF e o cookie `__Host-csrf`.

**Architecture:** Mesma camada de páginas da US-18: um controller de página (`src/controllers/pages/admin.controller.js`) chama o `UserService` que a API já usa; views EJS com os partials e o CSS do glass-login; todo POST termina em redirect 303 com aviso por parâmetro fixo. As rotas do painel passam pelo guard (sessão) e pelo `isAdmin` antes de ler formulário ou CSRF.

**Tech Stack:** Node, Express 5, EJS 6, zod 4, Jest 30 + supertest, Playwright 1.63 (Chrome do sistema).

**Spec:** `docs/superpowers/specs/2026-09-29-us19-painel-admin-design.md`

## Global Constraints

- Textos em português; dados do usuário só com `<%= %>`; `<%- %>` só para `include`; nenhum script embutido.
- `express.urlencoded` só nas rotas POST das páginas (a constante `form` de `src/routes/page.routes.js`).
- Rotas do painel: `isAdmin` primeiro, depois `form`/`verifyCsrf` nos POST, depois o controller. Sem rate limit no painel.
- Todo POST → redirect 303; avisos só por parâmetro fixo (`done=updated|role|deleted`, `error=last-admin`), lidos com `Object.hasOwn` (nunca `map[key]` direto com a chave da URL).
- Senha nunca volta preenchida.
- Testes de página usam `tests/helpers/browser.js` (`browser`, `csrfFrom`, `textOf`) e `tests/helpers/auth.js` (`createUser`, `tokenFor`); o agent do supertest não manda cookie `Secure`. `submit(path, form, { from })` só copia o `_csrf` da página `from`: campos ocultos (busca, página) vão no `form` do teste, e a presença deles na página é conferida à parte.
- E2E: `npm run test:e2e` no Chrome do sistema (`channel: 'chrome'`, `127.0.0.1:3100`); não baixar navegadores.
- Commits em inglês, estilo do repositório (`feat(pages): …`), terminando com `Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq`; só commitar com `npm test`, `npm run lint` e `npx prettier --check .` passando (e `npm run test:e2e` quando a task mexe em telas usadas pelo E2E).

---

### Task 1: Cookie `__Host-csrf` e "Sair" por POST

**Files:**

- Modify: `src/middlewares/csrf.js`, `tests/csrf.test.js`
- Modify: `src/views/partials/topbar.ejs`, `public/css/app.css`, `src/routes/page.routes.js`, `src/middlewares/authGuard.js`
- Modify: `tests/public-routes.test.js`, `tests/pages/csrf-routes.test.js`, `tests/logout.test.js`, `tests/pages/users.test.js`, `e2e/auth.spec.js`

**Interfaces:**

- Produces: cookie CSRF chamado `__Host-csrf`; `POST /logout` (página) com CSRF; a barra do topo com `<form method="post" action="/logout">`; `GET /users` emite o token CSRF.

- [ ] **Step 1: Testes do cookie (falham)**

Em `tests/csrf.test.js`, trocar o nome do cookie nos três lugares: `c.startsWith('csrf=')` → `c.startsWith('__Host-csrf=')`; `page.cookies.set('csrf', 'nao-hex')` → `page.cookies.set('__Host-csrf', 'nao-hex')`; `page.cookies.get('csrf')` → `page.cookies.get('__Host-csrf')`. Mudar o nome do primeiro teste para `'a página grava o cookie __Host-csrf httpOnly, Secure e SameSite=Lax'`.

Run: `npm test -- tests/csrf.test.js` → FAIL (o cookie ainda se chama `csrf`).

- [ ] **Step 2: Renomear o cookie**

Em `src/middlewares/csrf.js`, trocar `const COOKIE = 'csrf';` por:

```js
// O prefixo __Host- exige Secure, path=/ e nenhum Domain: um subdomínio não
// consegue plantar o cookie.
const COOKIE = '__Host-csrf';
```

Run: `npm test -- tests/csrf.test.js` → PASS. Rodar a suíte, lint e Prettier, e commitar:

```bash
git add src/middlewares/csrf.js tests/csrf.test.js
git commit -F - <<'EOF'
feat(security): name the CSRF cookie __Host-csrf

The __Host- prefix makes browsers accept the cookie only with Secure,
path=/ and no Domain, so a subdomain cannot plant its own value. The
options were already those; a browser holding the old "csrf" cookie
just gets a new one on the next page.

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```

- [ ] **Step 3: Testes do "Sair" por POST (falham)**

Em `tests/logout.test.js`, acrescentar no topo `const { browser, textOf } = require('./helpers/browser');`, trocar `const { createUserWithToken } = require('./helpers/auth');` por `const { createUser, tokenFor, createUserWithToken } = require('./helpers/auth');` e acrescentar este bloco no fim:

```js
describe('POST /logout (página)', () => {
  const loggedIn = (user) => {
    const page = browser(app);
    page.cookies.set('access_token', tokenFor(user));
    return page;
  };

  it('com o token do formulário, sai, apaga o cookie e derruba a sessão', async () => {
    const user = await createUser();
    const jwt = tokenFor(user);
    const page = loggedIn(user);

    const res = await page.submit('/logout', {}, { from: '/users' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expect(page.cookies.has('access_token')).toBe(false);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${jwt}`);
    expect(me.status).toBe(401);
  });

  it('sem o token CSRF: 403 e a sessão continua', async () => {
    const user = await createUser();
    const page = loggedIn(user);
    await page.get('/users');

    const res = await page.post('/logout', {});

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('A página expirou');
    expect((await page.get('/users')).status).toBe(200);
  });
});
```

Em `tests/pages/users.test.js`, acrescentar:

```js
it('a barra tem o formulário de sair com o token CSRF', async () => {
  const viewer = await createUser();

  const res = await sessionOf(viewer).get('/users');

  expect(res.text).toMatch(/<form[^>]*method="post"[^>]*action="\/logout"/);
  expect(res.text).toContain('name="_csrf"');
});
```

Em `tests/public-routes.test.js`, na lista "libera", acrescentar `['POST', '/logout'],`. Em `tests/pages/csrf-routes.test.js`, no `it.each`, acrescentar `['/logout', '/login'],`.

Run: `npm test -- tests/logout.test.js tests/pages/users.test.js tests/public-routes.test.js tests/pages/csrf-routes.test.js` → FAIL.

- [ ] **Step 4: Implementar**

`src/views/partials/topbar.ejs` — trocar `<a href="/logout">Sair</a>` por:

```ejs
    <form method="post" action="/logout">
      <%- include('csrf') %>
      <button type="submit">Sair</button>
    </form>
```

`public/css/app.css` — trocar o seletor `.gl-session a {` por `.gl-session a,\n.gl-session button {` e acrescentar logo depois do bloco:

```css
.gl-session form {
  margin: 0;
}
.gl-session button {
  border: 0;
  font: 700 14px var(--font-sans);
  cursor: pointer;
}
```

`src/routes/page.routes.js` — trocar `router.get('/users', usersPage.list);` por `router.get('/users', issueCsrf, usersPage.list);` e, logo abaixo da linha do `GET /logout`, acrescentar:

```js
// O botão "Sair" da barra: POST com CSRF, para outro site não deslogar ninguém.
router.post('/logout', form, verifyCsrf, identifyUser, authController.logoutPage);
```

`src/middlewares/authGuard.js` — acrescentar `['POST', '/logout'],` ao lado de `['GET', '/logout'],` (o comentário do logout vale para os dois).

`e2e/auth.spec.js` — trocar `page.getByRole('link', { name: 'Sair' })` por `page.getByRole('button', { name: 'Sair' })`.

- [ ] **Step 5: Rodar e commitar**

Run: `npm test && npm run test:e2e && npm run lint && npx prettier --check .` → tudo passa (E2E: 3 passed).

```bash
git add src public tests e2e
git commit -F - <<'EOF'
feat(pages): log out through a POST form with CSRF

The top bar's "Sair" is now a form that posts to /logout with the CSRF
token, so another site can no longer log anyone out by pointing the
browser at a URL. POST /logout joins the allowlist and behaves like
GET /logout, which stays for the spec. /users now issues the token,
since the bar is there.

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```

---

### Task 2: Painel com contadores, tabela e troca de perfil

**Files:**

- Create: `src/controllers/pages/admin.controller.js`, `src/views/admin.ejs`, `src/views/partials/list-state.ejs`, `tests/pages/admin.test.js`
- Modify: `src/routes/page.routes.js`, `public/css/app.css`

**Interfaces:**

- Consumes: `userService.getStats()` → `{ totalUsers, admins, inactive }`; `userService.listUsers(viewer, { page, limit, search })` → `{ data (lean, com _id), total, totalPages }`; `userService.changeRole(viewer, id, role)` (AppError 409 `LAST_ADMIN`, 404 `NOT_FOUND`); `listUsersQuery`, `userIdParams`, `updateRoleSchema`; `isAdmin` (AppError 403).
- Produces (usados nas Tasks 3 e 4, no mesmo controller): `listState(source) → { page, search }`, `withState(path, state, extra = {}) → string`, `userId(req) → string` (404 se inválido), `notFound()`, `pick(map, key)`; partial `list-state` (usa `state`).

- [ ] **Step 1: Escrever os testes (falham)**

`tests/pages/admin.test.js`:

```js
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
```

Run: `npm test -- tests/pages/admin.test.js` → FAIL (`/admin` dá 404).

- [ ] **Step 2: Controller e partial**

`src/controllers/pages/admin.controller.js`:

```js
const userService = require('../../services/UserService');
const AppError = require('../../utils/AppError');
const { listUsersQuery, userIdParams, updateRoleSchema } = require('../../validators/user.schemas');

const PAGE_SIZE = 20;

// Avisos depois de uma ação: só códigos conhecidos, nunca texto da URL.
const NOTICES = {
  updated: 'Usuário atualizado.',
  role: 'Perfil alterado.',
  deleted: 'Usuário excluído.',
};
const ERRORS = { 'last-admin': 'Não é possível remover o último admin.' };

// hasOwn: uma chave como "__proto__" não pode trazer um valor herdado.
const pick = (map, key) =>
  typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;

const notFound = () => new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');

// Busca e página da lista: vêm da query nos GET e de campos ocultos nos POST,
// para cada ação voltar à mesma posição.
function listState(source) {
  const parsed = listUsersQuery.safeParse({
    page: source.page,
    search: source.search || undefined,
  });
  return parsed.success
    ? { page: parsed.data.page, search: parsed.data.search ?? '' }
    : { page: 1, search: '' };
}

function withState(path, { page, search }, extra = {}) {
  const query = new URLSearchParams({
    ...(search && { search }),
    ...(page > 1 && { page: String(page) }),
    ...extra,
  }).toString();
  return query ? `${path}?${query}` : path;
}

function userId(req) {
  const parsed = userIdParams.safeParse(req.params);
  if (!parsed.success) throw notFound();
  return parsed.data.id;
}

async function dashboard(req, res) {
  const state = listState(req.query);
  const [stats, result] = await Promise.all([
    userService.getStats(),
    userService.listUsers(req.user, {
      page: state.page,
      limit: PAGE_SIZE,
      search: state.search || undefined,
    }),
  ]);

  const users = result.data.map((user) => {
    const id = String(user._id);
    return {
      id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isSelf: id === req.user.id,
      editHref: withState(`/admin/users/${id}/edit`, state),
      deleteHref: withState(`/admin/users/${id}/delete`, state),
    };
  });

  res.render('admin', {
    viewer: { username: req.user.username, isAdmin: true },
    stats,
    users,
    state,
    notice: pick(NOTICES, req.query.done),
    error: pick(ERRORS, req.query.error),
    pages: Array.from({ length: result.totalPages }, (_, i) => ({
      number: i + 1,
      href: withState('/admin', { ...state, page: i + 1 }),
      current: i + 1 === state.page,
    })),
  });
}

async function changeRole(req, res) {
  const id = userId(req);
  const state = listState(req.body);
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Perfil inválido');

  try {
    await userService.changeRole(req.user, id, parsed.data.role);
  } catch (err) {
    if (err.code === 'LAST_ADMIN') {
      return res.redirect(303, withState('/admin', state, { error: 'last-admin' }));
    }
    throw err;
  }
  return res.redirect(303, withState('/admin', state, { done: 'role' }));
}

module.exports = { dashboard, changeRole };
```

(`listState`, `withState`, `userId`, `notFound` e `pick` ficam no módulo para as Tasks 3 e 4.)

`src/views/partials/list-state.ejs`:

```ejs
<% if (state.page > 1) { %><input type="hidden" name="page" value="<%= state.page %>" /><% } %>
<% if (state.search) { %><input type="hidden" name="search" value="<%= state.search %>" /><% } %>
```

- [ ] **Step 3: View, CSS e rotas**

`src/views/admin.ejs`:

```ejs
<%- include('partials/head', { title: 'Painel admin' }) %>
<div class="gl-app">
  <%- include('partials/decor') %>
  <%- include('partials/topbar', { active: 'admin' }) %>
  <main class="gl-main">
    <div class="gl-toolbar"><h1>Painel admin</h1></div>
    <%- include('partials/messages') %>
    <ul class="gl-stats" aria-label="Resumo">
      <li class="gl-stat gl-glass"><strong><%= stats.totalUsers %></strong> <span><%= stats.totalUsers === 1 ? 'usuário' : 'usuários' %></span></li>
      <li class="gl-stat gl-glass"><strong><%= stats.admins %></strong> <span><%= stats.admins === 1 ? 'admin' : 'admins' %></span></li>
      <li class="gl-stat gl-glass"><strong><%= stats.inactive %></strong> <span><%= stats.inactive === 1 ? 'inativo' : 'inativos' %></span></li>
    </ul>
    <section class="gl-panel gl-glass" aria-labelledby="accounts-title">
      <div class="gl-toolbar">
        <h2 id="accounts-title">Contas</h2>
        <form class="gl-search" method="get" action="/admin" role="search">
          <label class="gl-visually-hidden" for="search">Buscar por username</label>
          <input id="search" name="search" type="search" value="<%= state.search %>" placeholder="Buscar por username" />
          <button type="submit">Buscar</button>
        </form>
      </div>
      <% if (users.length === 0) { %>
        <p class="gl-count">Nenhum usuário encontrado<% if (state.search) { %> para “<%= state.search %>”<% } %>.</p>
      <% } else { %>
        <div class="gl-table-wrap">
          <table class="gl-table">
            <thead>
              <tr><th scope="col">Username</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Status</th><th scope="col">Ações</th></tr>
            </thead>
            <tbody>
              <% for (const user of users) { %>
                <tr>
                  <td><%= user.username %><% if (user.isSelf) { %><span class="gl-you">(você)</span><% } %></td>
                  <td><%= user.email %></td>
                  <td><span class="gl-badge<%= user.role === 'admin' ? ' gl-badge--admin' : '' %>"><%= user.role === 'admin' ? 'admin' : 'usuário' %></span></td>
                  <td><span class="gl-badge<%= user.isActive ? '' : ' gl-badge--off' %>"><%= user.isActive ? 'ativo' : 'inativo' %></span></td>
                  <td>
                    <div class="gl-actions">
                      <a class="gl-action" href="<%= user.editHref %>">Editar</a>
                      <% if (!user.isSelf) { %>
                        <form method="post" action="/admin/users/<%= user.id %>/role">
                          <%- include('partials/csrf') %>
                          <%- include('partials/list-state') %>
                          <input type="hidden" name="role" value="<%= user.role === 'admin' ? 'user' : 'admin' %>" />
                          <button class="gl-action" type="submit"><%= user.role === 'admin' ? 'Tornar usuário' : 'Tornar admin' %></button>
                        </form>
                        <a class="gl-action gl-action--danger" href="<%= user.deleteHref %>">Excluir</a>
                      <% } %>
                    </div>
                  </td>
                </tr>
              <% } %>
            </tbody>
          </table>
        </div>
      <% } %>
      <% if (pages.length > 1) { %>
        <nav class="gl-pager" aria-label="Páginas">
          <% for (const p of pages) { %>
            <% if (p.current) { %><span aria-current="page"><%= p.number %></span><% } else { %><a href="<%= p.href %>"><%= p.number %></a><% } %>
          <% } %>
        </nav>
      <% } %>
    </section>
  </main>
</div>
<%- include('partials/foot') %>
```

Acrescentar ao fim de `public/css/app.css`:

```css
/* Painel admin: contadores e tabela de vidro com as ações por linha. */
.gl-stats {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.gl-stat {
  padding: 16px 22px;
  border-radius: 18px;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.gl-stat strong {
  font-size: 34px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.gl-stat span {
  font-size: 15px;
  opacity: 0.85;
}
.gl-panel {
  margin-top: 24px;
  padding: 20px 24px;
  border-radius: 22px;
}
.gl-panel h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.gl-table-wrap {
  margin-top: 12px;
  overflow-x: auto;
}
.gl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
.gl-table th {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.35);
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.8;
}
.gl-table td {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  font-weight: 500;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.gl-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.gl-actions form {
  margin: 0;
}
.gl-action {
  display: inline-block;
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: rgba(0, 52, 101, 0.85);
  color: var(--white);
  font: 700 12px var(--font-sans);
  text-decoration: none;
  cursor: pointer;
}
.gl-action:hover {
  filter: brightness(1.12);
}
.gl-action--danger {
  background: rgba(163, 20, 58, 0.9);
}
.gl-you {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 700;
  opacity: 0.8;
}
```

`src/routes/page.routes.js` — importar `const adminPages = require('../controllers/pages/admin.controller');`, trocar o import do auth por `const { identifyUser, isAdmin } = require('../middlewares/auth');` e acrescentar no fim, antes do `module.exports`:

```js
// Só admin: o guard garantiu a sessão e o isAdmin vem antes de ler formulário
// ou CSRF (quem não é admin recebe 403 direto). Sem rate limit: só um admin
// logado chega aqui.
router.get('/admin', isAdmin, issueCsrf, adminPages.dashboard);
router.post('/admin/users/:id/role', isAdmin, form, verifyCsrf, adminPages.changeRole);
```

- [ ] **Step 4: Rodar e commitar**

Run: `npm test -- tests/pages/admin.test.js` → PASS; depois `npm test && npm run lint && npx prettier --check .`.

```bash
git add src public tests
git commit -F - <<'EOF'
feat(pages): add the admin panel with counters and role changes

GET /admin shows the counters (users, admins, inactive) and a glass
table of accounts with e-mail, role, status and per-row actions, with
search and pages of 20; the admin's own row is marked "(você)" and has
no demote or delete action. "Tornar admin"/"Tornar usuário" posts to
/admin/users/:id/role and comes back to the same search and page with
a fixed notice, including "Não é possível remover o último admin".
Regular users get the 403 page before any form or CSRF check.

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```

---

### Task 3: Editar usuário

**Files:**

- Modify: `src/controllers/pages/admin.controller.js`, `src/routes/page.routes.js`
- Create: `src/views/admin-edit.ejs`, `tests/pages/admin-edit.test.js`

**Interfaces:**

- Consumes: `listState`, `withState`, `userId`, `notFound` (Task 2); `userService.getUser(viewer, id)` (AppError 404); `userService.updateUser(viewer, id, { username, password })` (AppError 409 com `details` por campo); `updateUserSchema`.
- Produces: `GET /admin/users/:id/edit`, `POST /admin/users/:id`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/pages/admin-edit.test.js`:

```js
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
```

Run: `npm test -- tests/pages/admin-edit.test.js` → FAIL.

- [ ] **Step 2: Implementar**

Em `src/controllers/pages/admin.controller.js`: acrescentar `const { z } = require('zod');` no topo, `updateUserSchema` ao import de `user.schemas`, e antes do `module.exports`:

```js
const text = (value) => (typeof value === 'string' ? value : '');

function renderEdit(res, status, { id, user, state, values = {}, errors }) {
  res.status(status).render('admin-edit', {
    user: { id, username: user.username },
    values,
    errors,
    state,
    backHref: withState('/admin', state),
  });
}

async function showEdit(req, res) {
  const id = userId(req);
  const state = listState(req.query);
  const user = await userService.getUser(req.user, id);
  renderEdit(res, 200, { id, user, state, values: { username: user.username } });
}

// Senha em branco = manter a atual. Trocar a senha derruba as sessões da conta
// (o hook do model sobe o tokenVersion, RN-11).
async function update(req, res) {
  const id = userId(req);
  const state = listState(req.body);
  const user = await userService.getUser(req.user, id);
  const values = { username: text(req.body.username) };
  const password = text(req.body.password);

  const parsed = updateUserSchema.safeParse({
    username: values.username,
    ...(password && { password }),
  });
  if (!parsed.success) {
    return renderEdit(res, 400, {
      id,
      user,
      state,
      values,
      errors: z.flattenError(parsed.error).fieldErrors,
    });
  }

  try {
    await userService.updateUser(req.user, id, parsed.data);
  } catch (err) {
    // 409: details já vem por campo (username).
    if (err.status === 409) {
      return renderEdit(res, 409, { id, user, state, values, errors: err.details });
    }
    throw err;
  }
  return res.redirect(303, withState('/admin', state, { done: 'updated' }));
}
```

e acrescentar `showEdit` e `update` ao `module.exports`.

`src/views/admin-edit.ejs`:

```ejs
<%- include('partials/head', { title: 'Editar usuário' }) %>
<%- include('partials/card-top', { heading: 'Editar ' + user.username }) %>
<form class="gl-form" method="post" action="/admin/users/<%= user.id %>" novalidate>
  <%- include('partials/csrf') %>
  <%- include('partials/list-state') %>
  <%- include('partials/field', { name: 'username', label: 'Username', type: 'text', autocomplete: 'off', value: values.username, hint: '3 a 30 caracteres: letras sem acento, números, ponto, hífen e _' }) %>
  <%- include('partials/field', { name: 'password', label: 'Nova senha', type: 'password', autocomplete: 'new-password', hint: 'Deixe em branco para manter. A troca encerra as sessões abertas dessa conta.' }) %>
  <button type="submit" class="gl-btn gl-submit">Salvar</button>
</form>
<p class="gl-footer"><a href="<%= backHref %>">Voltar ao painel</a></p>
<%- include('partials/card-bottom') %>
<%- include('partials/foot') %>
```

`src/routes/page.routes.js` — acrescentar depois das rotas do painel:

```js
router.get('/admin/users/:id/edit', isAdmin, issueCsrf, adminPages.showEdit);
router.post('/admin/users/:id', isAdmin, form, verifyCsrf, adminPages.update);
```

- [ ] **Step 3: Rodar e commitar**

Run: `npm test -- tests/pages/admin-edit.test.js` → PASS; depois `npm test && npm run lint && npx prettier --check .`.

```bash
git add src tests
git commit -F - <<'EOF'
feat(pages): let admins edit an account's username and password

/admin/users/:id/edit shows the username and an optional new password
("deixe em branco para manter"). Field errors come back on the form
(400 for the rules, 409 for a username in use) with the typed username
and never the password; success returns to the same search and page
with "Usuário atualizado.". A new password ends that account's
sessions, as the API already does.

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```

---

### Task 4: Excluir usuário com confirmação

**Files:**

- Modify: `src/controllers/pages/admin.controller.js`, `src/routes/page.routes.js`, `public/css/app.css`
- Create: `src/views/admin-delete.ejs`, `tests/pages/admin-delete.test.js`

**Interfaces:**

- Consumes: `listState`, `withState`, `userId` (Task 2); `userService.getUser(viewer, id)`; `userService.deleteUser(id)` (AppError 409 `LAST_ADMIN`, 404).
- Produces: `GET /admin/users/:id/delete`, `POST /admin/users/:id/delete`; classes `gl-btn--danger`, `gl-btn--ghost`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/pages/admin-delete.test.js`:

```js
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
```

Run: `npm test -- tests/pages/admin-delete.test.js` → FAIL.

- [ ] **Step 2: Implementar**

Em `src/controllers/pages/admin.controller.js`, antes do `module.exports`:

```js
async function showDelete(req, res) {
  const id = userId(req);
  const state = listState(req.query);
  const user = await userService.getUser(req.user, id);
  res.render('admin-delete', {
    user: { id, username: user.username, email: user.email },
    state,
    backHref: withState('/admin', state),
  });
}

// D-13: exclusão definitiva, levando os links pendentes da conta. O último
// admin ativo não sai (RN-09).
async function remove(req, res) {
  const id = userId(req);
  const state = listState(req.body);
  try {
    await userService.deleteUser(id);
  } catch (err) {
    if (err.code === 'LAST_ADMIN') {
      return res.redirect(303, withState('/admin', state, { error: 'last-admin' }));
    }
    throw err;
  }
  return res.redirect(303, withState('/admin', state, { done: 'deleted' }));
}
```

e acrescentar `showDelete` e `remove` ao `module.exports`.

`src/views/admin-delete.ejs`:

```ejs
<%- include('partials/head', { title: 'Excluir usuário' }) %>
<%- include('partials/card-top', { heading: 'Excluir usuário' }) %>
<p class="gl-text">
  Excluir <strong><%= user.username %></strong> (<%= user.email %>)? A conta e os links pendentes
  dela serão apagados. Isso não pode ser desfeito.
</p>
<form class="gl-form" method="post" action="/admin/users/<%= user.id %>/delete">
  <%- include('partials/csrf') %>
  <%- include('partials/list-state') %>
  <button type="submit" class="gl-btn gl-btn--danger">Excluir conta</button>
</form>
<a class="gl-btn gl-btn--ghost" href="<%= backHref %>">Cancelar</a>
<%- include('partials/card-bottom') %>
<%- include('partials/foot') %>
```

Acrescentar ao fim de `public/css/app.css`:

```css
.gl-btn--danger {
  background: #a3143a;
}
.gl-btn--ghost {
  margin-top: 12px;
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
```

`src/routes/page.routes.js` — acrescentar:

```js
router.get('/admin/users/:id/delete', isAdmin, issueCsrf, adminPages.showDelete);
router.post('/admin/users/:id/delete', isAdmin, form, verifyCsrf, adminPages.remove);
```

- [ ] **Step 3: Rodar e commitar**

Run: `npm test -- tests/pages/admin-delete.test.js` → PASS; depois `npm test && npm run lint && npx prettier --check .`.

```bash
git add src public tests
git commit -F - <<'EOF'
feat(pages): let admins delete an account after a confirmation

/admin/users/:id/delete asks "Excluir <username> (<e-mail>)?" in the
glass card; only the red "Excluir conta" button posts the deletion,
with no JavaScript. It removes the account and its pending links and
returns to the same search and page with "Usuário excluído."; the last
active admin stays, with "Não é possível remover o último admin.".

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```

---

### Task 5: E2E do painel

**Files:**

- Create: `e2e/helpers.js`, `e2e/admin.spec.js`
- Modify: `e2e/server.js`, `e2e/auth.spec.js`

**Interfaces:**

- Consumes: páginas das Tasks 1–4; `POST /api/v1/register`, `POST /api/v1/auth/activate`, `GET /__e2e/last-activation-token?email=` (só no `e2e/server.js`).
- Produces: `login(page, username, password)` e `activeUser(request, prefix)` → `{ name, email }` em `e2e/helpers.js`.

- [ ] **Step 1: Admin no servidor de E2E e helpers**

Em `e2e/server.js`, depois do `User.create` da `ana`, acrescentar:

```js
await User.create({
  username: 'root',
  email: 'root@example.com',
  password: 'senha-forte-123',
  role: 'admin',
  isActive: true,
});
```

e atualizar o comentário do topo para dizer "uma usuária ativa e um admin".

`e2e/helpers.js`:

```js
const { expect } = require('@playwright/test');

async function login(page, username, password) {
  await page.goto('/login');
  await page.getByLabel('Usuário ou e-mail').fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// Conta nova e ativa, única por tentativa: o retry do CI roda no mesmo
// servidor e no mesmo banco.
async function activeUser(request, prefix, testInfo) {
  const name = `${prefix}${testInfo.retry}${Date.now()}`;
  const email = `${name}@example.com`;
  const created = await request.post('/api/v1/register', {
    data: { username: name, email, password: 'senha-forte-789' },
  });
  expect(created.status()).toBe(201);

  let token = null;
  await expect
    .poll(async () => {
      const res = await request.get(
        `/__e2e/last-activation-token?email=${encodeURIComponent(email)}`,
      );
      ({ token } = await res.json());
      return token;
    })
    .toBeTruthy();
  const activated = await request.post('/api/v1/auth/activate', { data: { token } });
  expect(activated.status()).toBe(200);

  return { name, email };
}

module.exports = { login, activeUser };
```

Em `e2e/auth.spec.js`, apagar a função `login` local e importar a dos helpers: `const { login } = require('./helpers');`.

- [ ] **Step 2: Spec do painel**

`e2e/admin.spec.js`:

```js
const { test, expect } = require('@playwright/test');
const { login, activeUser } = require('./helpers');

test('o admin promove e exclui uma conta pelo painel', async ({ page, request }, testInfo) => {
  const { name } = await activeUser(request, 'caio', testInfo);
  await login(page, 'root', 'senha-forte-123');
  await expect(page).toHaveURL(/\/users$/);

  await page.goto(`/admin?search=${name}`);
  await expect(page.getByRole('heading', { name: 'Painel admin' })).toBeVisible();
  const row = () => page.getByRole('row').filter({ hasText: name });

  await row().getByRole('button', { name: 'Tornar admin' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil alterado');
  await expect(row().getByRole('button', { name: 'Tornar usuário' })).toBeVisible();

  await row().getByRole('link', { name: 'Excluir' }).click();
  await expect(page.getByRole('heading', { name: 'Excluir usuário' })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await expect(page.getByRole('status')).toContainText('Usuário excluído');
  await expect(row()).toHaveCount(0);
});

test('usuário comum não entra no painel', async ({ page }) => {
  await login(page, 'ana', 'senha-forte-123');
  await expect(page).toHaveURL(/\/users$/);

  const res = await page.goto('/admin');

  expect(res.status()).toBe(403);
  await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
});
```

- [ ] **Step 3: Rodar e commitar**

Run: `npm run test:e2e` → 5 passed; depois `npm test && npm run lint && npx prettier --check .`.

```bash
git add e2e
git commit -F - <<'EOF'
test(e2e): cover the admin panel

The E2E server now seeds an admin too. A new spec creates an active
account through the API (unique per attempt, so a CI retry does not
clash), logs in as the admin, promotes the account from the panel,
sees it as admin and deletes it through the confirmation; another
checks that a regular user gets the 403 page. The login helper moved
to e2e/helpers.js.

Claude-Session: https://claude.ai/code/session_019DytGWXTyAWpnqvDKCUsBq
EOF
```
