const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./helpers/db');
const User = require('../src/models/User');
const userRepository = require('../src/repositories/UserRepository');
const AppError = require('../src/utils/AppError');
const authService = require('../src/services/AuthService');

const input = (overrides = {}) => ({
  username: 'ana',
  email: 'ana@example.com',
  password: 'senha-forte-123',
  ...overrides,
});

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await db.clear();
});
afterAll(db.close);

describe('AuthService.register', () => {
  it('cria o usuário comum e inativo', async () => {
    const user = await authService.register(input());

    expect(user).toMatchObject({ username: 'ana', role: 'user', isActive: false });
  });

  it('ignora role e isActive vindos de fora', async () => {
    const user = await authService.register(input({ role: 'admin', isActive: true }));

    const stored = await User.findById(user._id).lean();
    expect(stored).toMatchObject({ role: 'user', isActive: false });
  });

  it('recusa username já usado, sem diferenciar maiúsculas', async () => {
    await authService.register(input({ username: 'Ana' }));

    const attempt = authService.register(input({ username: 'ana', email: 'outra@example.com' }));

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      details: { username: [expect.any(String)] },
    });
  });

  it('recusa e-mail já usado', async () => {
    await authService.register(input());

    await expect(authService.register(input({ username: 'outra' }))).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      details: { email: [expect.any(String)] },
    });
  });

  it('deixa passar erros do banco que não são duplicidade', async () => {
    const dbDown = new Error('conexão perdida');
    jest.spyOn(userRepository, 'create').mockRejectedValue(dbDown);

    await expect(authService.register(input())).rejects.toBe(dbDown);
  });

  // Dois registros simultâneos passam pela checagem e o índice único barra o
  // segundo; a resposta tem que ser a mesma de um duplicado comum.
  it('traduz a colisão no índice único para o mesmo 409', async () => {
    await authService.register(input());
    jest.spyOn(userRepository, 'findByUsernameOrEmail').mockResolvedValue(null);

    const attempt = authService.register(input({ email: 'outra@example.com' }));

    await expect(attempt).rejects.toMatchObject({ status: 409, code: 'USERNAME_TAKEN' });
  });
});

describe('AuthService.login', () => {
  const activeUser = (overrides = {}) => User.create({ ...input(), isActive: true, ...overrides });

  it('devolve token, expiresIn e o usuário', async () => {
    const user = await activeUser({ role: 'admin', tokenVersion: 3 });

    const result = await authService.login({ username: 'ana', password: 'senha-forte-123' });

    expect(result.expiresIn).toBe(3600);
    expect(result.user.username).toBe('ana');
    expect(jwt.decode(result.token)).toMatchObject({ sub: user.id, role: 'admin', tv: 3 });
  });

  it('não expõe a senha no usuário devolvido', async () => {
    await activeUser();

    const { user } = await authService.login({ username: 'ana', password: 'senha-forte-123' });

    expect(user.toJSON()).not.toHaveProperty('password');
  });

  it.each([
    ['username com outra caixa', 'ANA'],
    ['e-mail', 'ana@example.com'],
    ['e-mail com outra caixa', 'Ana@Example.COM'],
  ])('aceita %s', async (_what, username) => {
    await activeUser();

    const result = await authService.login({ username, password: 'senha-forte-123' });

    expect(result.user.username).toBe('ana');
  });

  it('recusa senha errada com 401 INVALID_CREDENTIALS', async () => {
    await activeUser();

    await expect(
      authService.login({ username: 'ana', password: 'senha-errada' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('responde igual para usuário inexistente e senha errada', async () => {
    await activeUser();

    const wrongPassword = await authService
      .login({ username: 'ana', password: 'senha-errada' })
      .catch((err) => err);
    const unknownUser = await authService
      .login({ username: 'ninguem', password: 'senha-errada' })
      .catch((err) => err);

    expect(unknownUser).toBeInstanceOf(AppError);
    expect([unknownUser.status, unknownUser.code, unknownUser.message]).toEqual([
      wrongPassword.status,
      wrongPassword.code,
      wrongPassword.message,
    ]);
  });

  // Sem isso, a resposta para usuário inexistente sai bem mais rápida e
  // denuncia quais usernames existem.
  it('roda o bcrypt com o mesmo custo mesmo quando o usuário não existe', async () => {
    await activeUser();
    const { password: realHash } = await User.findOne().select('+password').lean();
    const compare = jest.spyOn(bcrypt, 'compare');

    await authService.login({ username: 'ninguem', password: 'x' }).catch(() => {});

    expect(compare).toHaveBeenCalledTimes(1);
    const usedHash = compare.mock.calls[0][1];
    expect(bcrypt.getRounds(usedHash)).toBe(bcrypt.getRounds(realHash));
  });

  it('bloqueia conta inativa com 403 ACCOUNT_INACTIVE quando a senha está certa', async () => {
    await activeUser({ isActive: false });

    await expect(
      authService.login({ username: 'ana', password: 'senha-forte-123' }),
    ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_INACTIVE' });
  });

  it('não revela que a conta está inativa para quem erra a senha', async () => {
    await activeUser({ isActive: false });

    await expect(
      authService.login({ username: 'ana', password: 'senha-errada' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });
});
