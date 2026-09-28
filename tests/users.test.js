const mongoose = require('mongoose');
const request = require('supertest');
const db = require('./helpers/db');
const { createUser, createUserWithToken } = require('./helpers/auth');
const User = require('../src/models/User');
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

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
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
