const request = require('supertest');
const db = require('./helpers/db');
const { createUser, createUserWithToken } = require('./helpers/auth');
const app = require('../src/app');

// O próprio usuário vê de si os mesmos campos que o admin vê de qualquer conta.
const PROFILE_FIELDS = ['_id', 'createdAt', 'email', 'isActive', 'role', 'updatedAt', 'username'];
const SENSITIVE = /password|tokenHash|tokenVersion|__v/;

const getMe = (token) => {
  const call = request(app).get('/api/v1/me');
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('GET /api/v1/me', () => {
  it('exige token', async () => {
    const res = await getMe();

    expect(res.status).toBe(401);
  });

  it.each(['user', 'admin'])('devolve o próprio perfil completo para %s', async (role) => {
    const { user, token } = await createUserWithToken({ username: 'ana', role });
    await createUser({ username: 'bia' });

    const res = await getMe(token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(PROFILE_FIELDS);
    expect(res.body.user).toMatchObject({
      _id: user.id,
      username: 'ana',
      email: user.email,
      role,
      isActive: true,
    });
  });

  it('nunca devolve campos sensíveis', async () => {
    const { token } = await createUserWithToken();

    const res = await getMe(token);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(SENSITIVE);
  });

  it('depois do logout, dá 401', async () => {
    const { token } = await createUserWithToken();

    await request(app).post('/api/v1/logout').set('Authorization', `Bearer ${token}`);
    const res = await getMe(token);

    expect(res.status).toBe(401);
  });
});
