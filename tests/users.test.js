const mongoose = require('mongoose');
const request = require('supertest');
const db = require('./helpers/db');
const { createUser, createUserWithToken } = require('./helpers/auth');
const User = require('../src/models/User');
const AuthToken = require('../src/models/AuthToken');
const authTokenRepository = require('../src/repositories/AuthTokenRepository');
const app = require('../src/app');

// Projeções por perfil (D-08).
const USER_FIELDS = ['_id', 'createdAt', 'username'];
const ADMIN_FIELDS = ['_id', 'createdAt', 'email', 'isActive', 'role', 'updatedAt', 'username'];
const SENSITIVE = /password|tokenHash|tokenVersion|__v/;

const get = (path, token) => {
  const call = request(app).get(path);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

const put = (path, token, body) => {
  const call = request(app).put(path).send(body);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

const del = (path, token) => {
  const call = request(app).delete(path);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

const patch = (path, token, body) => {
  const call = request(app).patch(path).send(body);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('GET /api/v1/users', () => {
  it('exige token', async () => {
    const res = await get('/api/v1/users');

    expect(res.status).toBe(401);
  });

  it('mostra ao usuário comum só username e data de criação', async () => {
    const { token } = await createUserWithToken({ username: 'ana' });
    await createUser({ username: 'bia', role: 'admin' });

    const res = await get('/api/v1/users', token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const user of res.body.data) expect(Object.keys(user).sort()).toEqual(USER_FIELDS);
  });

  it('mostra ao admin todos os campos não sensíveis', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    await createUser({ username: 'ana', isActive: false });

    const res = await get('/api/v1/users', token);

    expect(res.status).toBe(200);
    for (const user of res.body.data) expect(Object.keys(user).sort()).toEqual(ADMIN_FIELDS);
    expect(res.body.data.find((u) => u.username === 'ana')).toMatchObject({
      email: expect.any(String),
      role: 'user',
      isActive: false,
    });
  });

  it('pagina do mais novo para o mais antigo', async () => {
    const { token } = await createUserWithToken({ username: 'primeiro' });
    for (const username of ['segundo', 'terceiro', 'quarto']) await createUser({ username });

    const res = await get('/api/v1/users?page=2&limit=3', token);

    expect(res.body).toMatchObject({ page: 2, limit: 3, total: 4, totalPages: 2 });
    expect(res.body.data.map((u) => u.username)).toEqual(['primeiro']);
  });

  it('usa page 1 e limit 20 por padrão', async () => {
    const { token } = await createUserWithToken();

    const res = await get('/api/v1/users', token);

    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('busca por parte do username, sem diferenciar maiúsculas', async () => {
    const { token } = await createUserWithToken({ username: 'joao' });
    await createUser({ username: 'Mariana' });

    const res = await get('/api/v1/users?search=ARI', token);

    expect(res.body.data.map((u) => u.username)).toEqual(['Mariana']);
    expect(res.body.total).toBe(1);
  });

  it.each([
    ['limit acima de 100', 'limit=101', 'limit'],
    ['page zero', 'page=0', 'page'],
    ['search repetido', 'search=a&search=b', 'search'],
  ])('responde 400 para %s', async (_why, query, field) => {
    const { token } = await createUserWithToken();

    const res = await get(`/api/v1/users?${query}`, token);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual([field]);
  });

  it.each(['user', 'admin'])('nunca devolve campos sensíveis para %s', async (role) => {
    const { token } = await createUserWithToken({ role });
    await createUser();

    const res = await get('/api/v1/users', token);

    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);
  });
});

describe('GET /api/v1/users/:id', () => {
  it('exige token', async () => {
    const res = await get(`/api/v1/users/${new mongoose.Types.ObjectId()}`);

    expect(res.status).toBe(401);
  });

  it('mostra ao usuário comum só username e data de criação', async () => {
    const { token } = await createUserWithToken();
    const target = await createUser({ username: 'ana' });

    const res = await get(`/api/v1/users/${target.id}`, token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(USER_FIELDS);
    expect(res.body.user.username).toBe('ana');
  });

  it('mostra ao admin todos os campos não sensíveis', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await get(`/api/v1/users/${target.id}`, token);

    expect(Object.keys(res.body.user).sort()).toEqual(ADMIN_FIELDS);
  });

  it('responde 400 para id malformado', async () => {
    const { token } = await createUserWithToken();

    const res = await get('/api/v1/users/123', token);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['id']);
  });

  it('responde 404 para id que não existe', async () => {
    const { token } = await createUserWithToken();

    const res = await get(`/api/v1/users/${new mongoose.Types.ObjectId()}`, token);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it.each(['user', 'admin'])('nunca devolve campos sensíveis para %s', async (role) => {
    const { token } = await createUserWithToken({ role });
    const target = await createUser();

    const res = await get(`/api/v1/users/${target.id}`, token);

    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);
  });
});

describe('PUT /api/v1/users/:id', () => {
  const NEW_PASSWORD = 'nova-senha-456';

  it('exige token', async () => {
    const target = await createUser();

    const res = await put(`/api/v1/users/${target.id}`, undefined, { username: 'outro' });

    expect(res.status).toBe(401);
  });

  // RN-07 / D-06: só admin altera contas, e o usuário comum nem a própria.
  it.each([
    ['em outra conta', false],
    ['na própria conta', true],
  ])('responde 403 ao usuário comum %s, sem alterar nada', async (_why, ownAccount) => {
    const { user, token } = await createUserWithToken({ username: 'ana' });
    const target = ownAccount ? user : await createUser({ username: 'bia' });

    const res = await put(`/api/v1/users/${target.id}`, token, { username: 'invasor' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await User.exists({ username: 'invasor' })).toBeNull();
  });

  it('responde 403 ao usuário comum antes de validar o corpo', async () => {
    const { user, token } = await createUserWithToken();

    const res = await put(`/api/v1/users/${user.id}`, token, {});

    expect(res.status).toBe(403);
  });

  it('atualiza o username e devolve o usuário na visão de admin', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await put(`/api/v1/users/${target.id}`, token, { username: 'ana.maria' });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(ADMIN_FIELDS);
    expect(res.body.user).toMatchObject({ _id: target.id, username: 'ana.maria' });
    expect((await User.findById(target.id)).username).toBe('ana.maria');
  });

  it('troca a senha: a nova passa no login', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await put(`/api/v1/users/${target.id}`, token, { password: NEW_PASSWORD });
    const login = await request(app)
      .post('/api/v1/login')
      .send({ username: 'ana', password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(login.status).toBe(200);
  });

  // RN-11: a troca de senha derruba as sessões abertas com a senha antiga.
  it('após trocar a senha, os tokens antigos do usuário dão 401', async () => {
    const { token: adminToken } = await createUserWithToken({ role: 'admin' });
    const { user: ana, token: anaToken } = await createUserWithToken({ username: 'ana' });

    await put(`/api/v1/users/${ana.id}`, adminToken, { password: NEW_PASSWORD });
    const res = await get('/api/v1/users', anaToken);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('trocar só o username não derruba as sessões do usuário', async () => {
    const { token: adminToken } = await createUserWithToken({ role: 'admin' });
    const { user: ana, token: anaToken } = await createUserWithToken({ username: 'ana' });

    const update = await put(`/api/v1/users/${ana.id}`, adminToken, { username: 'ana.maria' });
    const res = await get('/api/v1/users', anaToken);

    expect(update.status).toBe(200);
    expect(res.status).toBe(200);
  });

  // RN-08: role só muda pela rota dedicada (US-13).
  it('ignora role no corpo', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await put(`/api/v1/users/${target.id}`, token, {
      username: 'ana.maria',
      role: 'admin',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
    expect((await User.findById(target.id)).role).toBe('user');
  });

  it('responde 400 quando o corpo não traz username nem senha', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();

    const res = await put(`/api/v1/users/${target.id}`, token, { role: 'admin' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(['password', 'username']);
  });

  it('responde 409 quando o username já é de outro usuário, sem diferenciar maiúsculas', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    await createUser({ username: 'bia' });
    const target = await createUser({ username: 'ana' });

    const res = await put(`/api/v1/users/${target.id}`, token, { username: 'BIA' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'USERNAME_TAKEN',
      details: { username: [expect.any(String)] },
    });
  });

  it('aceita mudar só a caixa do próprio username', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await put(`/api/v1/users/${target.id}`, token, { username: 'Ana' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('Ana');
  });

  it('responde 404 para id que não existe', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await put(`/api/v1/users/${new mongoose.Types.ObjectId()}`, token, {
      username: 'ana',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('responde 400 para id malformado', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await put('/api/v1/users/123', token, { username: 'ana' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['id']);
  });

  it('nunca devolve campos sensíveis, nem depois de trocar a senha', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();

    const res = await put(`/api/v1/users/${target.id}`, token, { password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);
  });
});

describe('DELETE /api/v1/users/:id', () => {
  // Um token não usado por usuário e tipo (índice único parcial do model).
  const createAuthToken = (userId, tokenHash, type = 'activation') =>
    AuthToken.create({
      userId,
      type,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

  it('exige token', async () => {
    const target = await createUser();

    const res = await del(`/api/v1/users/${target.id}`);

    expect(res.status).toBe(401);
  });

  // RN-07 / D-06: só admin exclui contas, e o usuário comum nem a própria.
  it.each([
    ['em outra conta', false],
    ['na própria conta', true],
  ])('responde 403 ao usuário comum %s, sem excluir nada', async (_why, ownAccount) => {
    const { user, token } = await createUserWithToken();
    const target = ownAccount ? user : await createUser();

    const res = await del(`/api/v1/users/${target.id}`, token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await User.exists({ _id: target.id })).not.toBeNull();
  });

  it('responde 403 ao usuário comum antes de validar o id', async () => {
    const { token } = await createUserWithToken();

    const res = await del('/api/v1/users/123', token);

    expect(res.status).toBe(403);
  });

  // D-13: hard delete.
  it('exclui o usuário de vez e responde 204 sem corpo', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();

    const res = await del(`/api/v1/users/${target.id}`, token);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await User.exists({ _id: target.id })).toBeNull();
  });

  it('remove os auth_tokens do usuário excluído e mantém os dos outros', async () => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();
    await createAuthToken(target._id, 'a'.repeat(64));
    await createAuthToken(target._id, 'b'.repeat(64), 'password_reset');
    await createAuthToken(admin._id, 'c'.repeat(64));

    await del(`/api/v1/users/${target.id}`, token);

    expect(await AuthToken.countDocuments({ userId: target._id })).toBe(0);
    expect(await AuthToken.countDocuments({ userId: admin._id })).toBe(1);
  });

  // Tokens antes do usuário: se a remoção deles falhar, o usuário continua lá
  // e repetir a requisição funciona, em vez de dar 404 com tokens órfãos.
  it('mantém o usuário quando a remoção dos auth_tokens falha', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();
    jest.spyOn(authTokenRepository, 'deleteByUserId').mockRejectedValueOnce(new Error('falha'));

    const res = await del(`/api/v1/users/${target.id}`, token);

    expect(res.status).toBe(500);
    expect(await User.exists({ _id: target.id })).not.toBeNull();
  });

  it('os tokens do usuário excluído passam a dar 401', async () => {
    const { token: adminToken } = await createUserWithToken({ role: 'admin' });
    const { user: ana, token: anaToken } = await createUserWithToken();

    const res = await del(`/api/v1/users/${ana.id}`, adminToken);
    const after = await get('/api/v1/users', anaToken);

    expect(res.status).toBe(204);
    expect(after.status).toBe(401);
  });

  it('exclui outro admin quando quem pede continua como admin ativo', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const other = await createUser({ role: 'admin' });

    const res = await del(`/api/v1/users/${other.id}`, token);

    expect(res.status).toBe(204);
  });

  it('deixa o admin excluir a própria conta quando há outro admin ativo', async () => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });
    await createUser({ role: 'admin' });

    const res = await del(`/api/v1/users/${admin.id}`, token);

    expect(res.status).toBe(204);
  });

  // RN-09: o sistema sempre mantém ao menos 1 admin ativo.
  it.each([
    ['é o único admin', {}],
    ['o outro admin está inativo', { role: 'admin', isActive: false }],
  ])('responde 409 LAST_ADMIN quando o admin exclui a própria conta e %s', async (_why, other) => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });
    if (other.role) await createUser(other);

    const res = await del(`/api/v1/users/${admin.id}`, token);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    expect(await User.exists({ _id: admin.id })).not.toBeNull();
  });

  it('responde 404 para id que não existe', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await del(`/api/v1/users/${new mongoose.Types.ObjectId()}`, token);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
  });

  it('responde 400 para id malformado', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await del('/api/v1/users/123', token);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['id']);
  });
});

describe('PATCH /api/v1/users/:id/role', () => {
  const rolePath = (id) => `/api/v1/users/${id}/role`;

  it('exige token', async () => {
    const target = await createUser();

    const res = await patch(rolePath(target.id), undefined, { role: 'admin' });

    expect(res.status).toBe(401);
  });

  // D-07: a rota dedicada existe para evitar escalada de privilégio.
  it.each([
    ['em outra conta', false],
    ['na própria conta', true],
  ])('responde 403 ao usuário comum que tenta promover %s', async (_why, ownAccount) => {
    const { user, token } = await createUserWithToken();
    const target = ownAccount ? user : await createUser();

    const res = await patch(rolePath(target.id), token, { role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await User.findById(target.id)).role).toBe('user');
  });

  it('responde 403 ao usuário comum antes de validar o corpo', async () => {
    const { user, token } = await createUserWithToken();

    const res = await patch(rolePath(user.id), token, { role: 'superadmin' });

    expect(res.status).toBe(403);
  });

  it('promove um usuário a admin e devolve a visão de admin', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await patch(rolePath(target.id), token, { role: 'admin' });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(ADMIN_FIELDS);
    expect(res.body.user).toMatchObject({ _id: target.id, username: 'ana', role: 'admin' });
    expect((await User.findById(target.id)).role).toBe('admin');
  });

  it('rebaixa outro admin quando quem pede continua como admin ativo', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const other = await createUser({ role: 'admin' });

    const res = await patch(rolePath(other.id), token, { role: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
  });

  it('deixa o admin rebaixar a si mesmo quando há outro admin ativo', async () => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });
    await createUser({ role: 'admin' });

    const res = await patch(rolePath(admin.id), token, { role: 'user' });

    expect(res.status).toBe(200);
    expect((await User.findById(admin.id)).role).toBe('user');
  });

  // O token antigo carrega a role antiga.
  it('após mudar a role, os tokens antigos do usuário dão 401', async () => {
    const { token: adminToken } = await createUserWithToken({ role: 'admin' });
    const { user: ana, token: anaToken } = await createUserWithToken();

    await patch(rolePath(ana.id), adminToken, { role: 'admin' });
    const res = await get('/api/v1/users', anaToken);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('manter a mesma role responde 200 sem derrubar as sessões', async () => {
    const { token: adminToken } = await createUserWithToken({ role: 'admin' });
    const { user: ana, token: anaToken } = await createUserWithToken();

    const update = await patch(rolePath(ana.id), adminToken, { role: 'user' });
    const res = await get('/api/v1/users', anaToken);

    expect(update.status).toBe(200);
    expect(update.body.user.role).toBe('user');
    expect(res.status).toBe(200);
  });

  // RN-09: o sistema sempre mantém ao menos 1 admin ativo.
  it.each([
    ['é o único admin', {}],
    ['o outro admin está inativo', { role: 'admin', isActive: false }],
  ])('responde 409 LAST_ADMIN quando o admin rebaixa a si mesmo e %s', async (_why, other) => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });
    if (other.role) await createUser(other);

    const res = await patch(rolePath(admin.id), token, { role: 'user' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN');
    expect((await User.findById(admin.id)).role).toBe('admin');
  });

  // Não é rebaixamento: a regra do último admin não se aplica.
  it('deixa o único admin reenviar a própria role de admin', async () => {
    const { user: admin, token } = await createUserWithToken({ role: 'admin' });

    const res = await patch(rolePath(admin.id), token, { role: 'admin' });

    expect(res.status).toBe(200);
  });

  it('ignora outros campos do corpo', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser({ username: 'ana' });

    const res = await patch(rolePath(target.id), token, { role: 'admin', username: 'outro' });

    expect(res.status).toBe(200);
    expect((await User.findById(target.id)).username).toBe('ana');
  });

  it.each([
    ['role fora do enum', { role: 'superadmin' }],
    ['corpo sem role', {}],
  ])('responde 400 para %s', async (_why, body) => {
    const { token } = await createUserWithToken({ role: 'admin' });
    const target = await createUser();

    const res = await patch(rolePath(target.id), token, body);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['role']);
  });

  it('responde 404 para id que não existe', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await patch(rolePath(new mongoose.Types.ObjectId()), token, { role: 'admin' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
  });

  it('responde 400 para id malformado', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });

    const res = await patch(rolePath('123'), token, { role: 'admin' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['id']);
  });
});
