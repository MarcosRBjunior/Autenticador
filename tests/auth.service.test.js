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
