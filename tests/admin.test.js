const request = require('supertest');
const db = require('./helpers/db');
const { createUser, createUserWithToken } = require('./helpers/auth');
const app = require('../src/app');

const getAdmin = (token) => {
  const call = request(app).get('/api/v1/admin');
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('GET /api/v1/admin', () => {
  it('responde 401 sem token', async () => {
    const res = await getAdmin();

    expect(res.status).toBe(401);
  });

  it('responde 403 para usuário comum', async () => {
    const { token } = await createUserWithToken();

    const res = await getAdmin(token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('responde 200 com os contadores para admin', async () => {
    const { token } = await createUserWithToken({ role: 'admin' });
    await createUser({ role: 'admin' });
    await createUser();
    await createUser({ isActive: false });

    const res = await getAdmin(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalUsers: 4, admins: 2, inactive: 1 });
  });
});
