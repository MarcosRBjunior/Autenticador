const cookieParser = require('cookie-parser');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('./helpers/db');
const User = require('../src/models/User');
const tokenService = require('../src/services/TokenService');
const userRepository = require('../src/repositories/UserRepository');
const { isAuthenticated, isAdmin, identifyUser } = require('../src/middlewares/auth');
const { errorHandler } = require('../src/middlewares/errorHandler');

const SECRET = process.env.JWT_SECRET;
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const app = express();
app.use(cookieParser());
app.get('/api/me', isAuthenticated, (req, res) => res.json({ username: req.user.username }));
app.get('/api/admin', isAuthenticated, isAdmin, (req, res) => res.json({ ok: true }));
app.get('/api/admin-sem-auth', isAdmin, (req, res) => res.json({ ok: true }));
app.get('/api/quem', identifyUser, (req, res) =>
  res.json({ username: req.user?.username ?? null }),
);
app.use(errorHandler);

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    isActive: true,
    ...overrides,
  });

const tokenFor = (user) =>
  tokenService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });

const withBearer = (path, token) => request(app).get(path).set('Authorization', `Bearer ${token}`);

beforeAll(db.connect);
afterEach(async () => {
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('isAuthenticated', () => {
  it('aceita o token no header Authorization: Bearer e preenche req.user', async () => {
    const user = await createUser();

    const res = await withBearer('/api/me', tokenFor(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'ana' });
  });

  it('aceita o esquema bearer em minúsculas', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
  });

  it('aceita o token no cookie access_token', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/me')
      .set('Cookie', `access_token=${tokenFor(user)}`);

    expect(res.status).toBe(200);
  });

  it('responde 401 UNAUTHENTICATED sem token', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(['Basic YW5hOnNlbmhh', 'Bearer', 'Bearer '])(
    'responde 401 com Authorization malformado (%s)',
    async (header) => {
      const res = await request(app).get('/api/me').set('Authorization', header);

      expect(res.status).toBe(401);
    },
  );

  describe('tokens inválidos → 401 INVALID_TOKEN', () => {
    const expectInvalid = async (token) => {
      const res = await withBearer('/api/me', token);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    };

    it('token expirado', async () => {
      const user = await createUser();
      const expired = jwt.sign(
        { sub: user.id, role: 'user', tv: 0, exp: Math.floor(Date.now() / 1000) - 10 },
        SECRET,
        { algorithm: 'HS256' },
      );

      await expectInvalid(expired);
    });

    it('assinatura alterada', async () => {
      const user = await createUser();
      const token = tokenFor(user);

      await expectInvalid(token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA'));
    });

    it('alg: none', async () => {
      const user = await createUser();

      await expectInvalid(
        `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: user.id, role: 'admin', tv: 0 })}.`,
      );
    });

    it('tv desatualizado (senha trocada, logout ou mudança de perfil)', async () => {
      const user = await createUser();
      const token = tokenFor(user);
      await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

      await expectInvalid(token);
    });

    it('usuário que não existe mais', async () => {
      const user = await createUser();
      const token = tokenFor(user);
      await User.deleteOne({ _id: user._id });

      await expectInvalid(token);
    });

    it('sub que não é um id válido, sem virar erro 500', async () => {
      await expectInvalid(tokenService.sign({ sub: 'nao-e-um-id', role: 'user', tv: 0 }));
    });
  });

  it('usa o header quando header e cookie vêm juntos', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer token-ruim')
      .set('Cookie', `access_token=${tokenFor(user)}`);

    expect(res.status).toBe(401);
  });
});

describe('isAdmin', () => {
  it('deixa passar admin', async () => {
    const admin = await createUser({ role: 'admin' });

    const res = await withBearer('/api/admin', tokenFor(admin));

    expect(res.status).toBe(200);
  });

  it('responde 403 FORBIDDEN para usuário comum', async () => {
    const user = await createUser();

    const res = await withBearer('/api/admin', tokenFor(user));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // O perfil vem do banco, não do token: um token antigo com role admin de
  // alguém rebaixado já cai no tv; aqui o banco manda.
  it('decide pelo perfil do banco, não pelo que está no token', async () => {
    const user = await createUser();
    const tokenClaimingAdmin = tokenService.sign({ sub: user.id, role: 'admin', tv: 0 });

    const res = await withBearer('/api/admin', tokenClaimingAdmin);

    expect(res.status).toBe(403);
  });

  it('responde 401 se usado sem autenticação antes', async () => {
    const res = await request(app).get('/api/admin-sem-auth');

    expect(res.status).toBe(401);
  });
});

// Para o logout: identifica o dono de um token válido, mas nunca barra.
describe('identifyUser', () => {
  const whoAmI = (token) => {
    const call = request(app).get('/api/quem');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  it('preenche req.user com token válido', async () => {
    const user = await createUser();

    const res = await whoAmI(tokenFor(user));

    expect(res.body).toEqual({ username: 'ana' });
  });

  it('aceita o token pelo cookie', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/quem')
      .set('Cookie', `access_token=${tokenFor(user)}`);

    expect(res.body).toEqual({ username: 'ana' });
  });

  it('segue sem usuário quando não há token', async () => {
    const res = await whoAmI();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: null });
  });

  it('segue sem usuário com token adulterado', async () => {
    const res = await whoAmI('token-ruim');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: null });
  });

  it('segue sem usuário com tv desatualizado', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

    const res = await whoAmI(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: null });
  });

  // Banco fora do ar não é "token inválido": o erro segue para o errorHandler.
  it('deixa passar erros que não são de autenticação', async () => {
    const user = await createUser();
    jest.spyOn(userRepository, 'findById').mockRejectedValue(new Error('banco fora do ar'));

    const res = await whoAmI(tokenFor(user));

    expect(res.status).toBe(500);
  });
});
