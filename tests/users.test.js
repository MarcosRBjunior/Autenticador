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
