const request = require('supertest');
const db = require('./helpers/db');
const { createUserWithToken } = require('./helpers/auth');
const User = require('../src/models/User');
const app = require('../src/app');

const withToken = (call, token) => (token ? call.set('Authorization', `Bearer ${token}`) : call);
const listUsers = (token) => withToken(request(app).get('/api/v1/users'), token);
const tokenVersionOf = async (user) => (await User.findById(user._id).lean()).tokenVersion;

// Mesmos atributos do cookie gravado no login, com a data de expiração no passado.
function expectCookieCleared(res) {
  const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('access_token='));
  expect(cookie).toMatch(/^access_token=;/);
  expect(cookie).toMatch(/; Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  expect(cookie).toMatch(/; Path=\//);
  expect(cookie).toMatch(/; HttpOnly/);
  expect(cookie).toMatch(/; Secure/);
  expect(cookie).toMatch(/; SameSite=Lax/);
}

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('POST /api/v1/logout', () => {
  const logout = (token) => withToken(request(app).post('/api/v1/logout'), token);

  it('responde 204 sem corpo e limpa o cookie', async () => {
    const { token } = await createUserWithToken();

    const res = await logout(token);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expectCookieCleared(res);
  });

  // RF-16 / RN-11 (D-12): o JWT é stateless; o tokenVersion é o que o derruba.
  it('depois do logout, o token anterior dá 401', async () => {
    const { user, token } = await createUserWithToken();

    await logout(token);
    const res = await listUsers(token);

    expect(await tokenVersionOf(user)).toBe(1);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('invalida também o token que veio pelo cookie', async () => {
    const { token } = await createUserWithToken();
    const cookie = `access_token=${token}`;

    const res = await request(app).post('/api/v1/logout').set('Cookie', cookie);
    const after = await request(app).get('/api/v1/users').set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(after.status).toBe(401);
  });

  it('não derruba a sessão de outros usuários', async () => {
    const { token } = await createUserWithToken();
    const { user: bia, token: biaToken } = await createUserWithToken();

    await logout(token);

    expect(await tokenVersionOf(bia)).toBe(0);
    expect((await listUsers(biaToken)).status).toBe(200);
  });

  // Sair tem que funcionar sempre: não há o que invalidar, mas o cookie sai.
  it.each([
    ['sem token', () => undefined],
    ['com token adulterado', () => 'token-ruim'],
  ])('responde 204 e limpa o cookie %s', async (_why, tokenOf) => {
    const res = await logout(tokenOf());

    expect(res.status).toBe(204);
    expectCookieCleared(res);
  });

  it('responde 204 com token já invalidado, sem incrementar de novo', async () => {
    const { user, token } = await createUserWithToken();
    await logout(token);

    const res = await logout(token);

    expect(res.status).toBe(204);
    expectCookieCleared(res);
    expect(await tokenVersionOf(user)).toBe(1);
  });
});

describe('GET /logout', () => {
  it('invalida o token do cookie, limpa o cookie e redireciona para /login', async () => {
    const { user, token } = await createUserWithToken();

    const res = await request(app).get('/logout').set('Cookie', `access_token=${token}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expectCookieCleared(res);
    expect(await tokenVersionOf(user)).toBe(1);
  });

  it('redireciona para /login mesmo sem token', async () => {
    const res = await request(app).get('/logout');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expectCookieCleared(res);
  });
});
