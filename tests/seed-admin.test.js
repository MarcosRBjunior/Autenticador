const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { z } = require('zod');
const db = require('./helpers/db');
const User = require('../src/models/User');
const authService = require('../src/services/AuthService');
const { parseAdminConfig, seedAdmin } = require('../scripts/seed-admin');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'seed-admin.js');
const STRONG = 'S3nha-Forte-2026!';

const env = (overrides = {}) => ({
  NODE_ENV: 'development',
  ADMIN_USERNAME: 'admin',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'senha-dev-123',
  ...overrides,
});

const fieldsWithErrors = (fn) => {
  try {
    fn();
    return [];
  } catch (err) {
    return Object.keys(z.flattenError(err).fieldErrors).sort();
  }
};

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('parseAdminConfig', () => {
  it('lê e normaliza as variáveis ADMIN_*', () => {
    const config = parseAdminConfig(
      env({ ADMIN_USERNAME: ' admin ', ADMIN_EMAIL: 'Admin@Example.COM' }),
    );

    expect(config).toEqual({
      username: 'admin',
      email: 'admin@example.com',
      password: 'senha-dev-123',
    });
  });

  it('aponta todas as variáveis que faltam', () => {
    const missing = fieldsWithErrors(() => parseAdminConfig({ NODE_ENV: 'development' }));

    expect(missing).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_USERNAME']);
  });

  it('aceita senha simples fora de produção', () => {
    expect(fieldsWithErrors(() => parseAdminConfig(env({ ADMIN_PASSWORD: 'admin123' })))).toEqual(
      [],
    );
  });

  describe('em produção', () => {
    const prod = (password) => env({ NODE_ENV: 'production', ADMIN_PASSWORD: password });

    it.each([
      ['curta, mesmo variada', 'Ab1!Ab1!Ab1'],
      ['sem maiúscula', 's3nha-forte-2026!'],
      ['sem minúscula', 'S3NHA-FORTE-2026!'],
      ['sem número', 'Senha-Forte-Dois!'],
      ['sem símbolo', 'S3nhaForte2026'],
      ['comum', 'admin123'],
    ])('recusa senha fraca (%s)', (_why, password) => {
      expect(fieldsWithErrors(() => parseAdminConfig(prod(password)))).toEqual(['ADMIN_PASSWORD']);
    });

    it('aceita senha forte', () => {
      expect(fieldsWithErrors(() => parseAdminConfig(prod(STRONG)))).toEqual([]);
    });
  });
});

describe('seedAdmin', () => {
  const config = { username: 'admin', email: 'admin@example.com', password: STRONG };

  it('cria o admin ativo com a senha em hash', async () => {
    const result = await seedAdmin(config);

    const stored = await User.findOne({ username: 'admin' }).select('+password').lean();
    expect(result.created).toBe(true);
    expect(stored).toMatchObject({ role: 'admin', isActive: true });
    expect(stored.password).toMatch(/^\$2b\$/);
    expect(stored.password).not.toContain(STRONG);
  });

  it('não duplica quando roda duas vezes', async () => {
    await seedAdmin(config);

    const second = await seedAdmin(config);

    expect(second.created).toBe(false);
    await expect(User.countDocuments()).resolves.toBe(1);
  });

  it('não duplica se já existe um admin com o mesmo e-mail', async () => {
    await seedAdmin(config);

    const result = await seedAdmin({ ...config, username: 'outro-admin' });

    expect(result.created).toBe(false);
    await expect(User.countDocuments()).resolves.toBe(1);
  });

  // Se alguém se registrou antes com o username ou e-mail do admin, promover
  // essa conta daria acesso de admin a quem a criou.
  it('recusa quando já existe um usuário comum com o mesmo username, sem promovê-lo', async () => {
    await User.create({ username: 'Admin', email: 'intruso@example.com', password: 'qualquer-1' });

    await expect(seedAdmin(config)).rejects.toThrow(/usuário comum/);

    const intruso = await User.findOne({ email: 'intruso@example.com' }).lean();
    expect(intruso.role).toBe('user');
    await expect(User.countDocuments()).resolves.toBe(1);
  });

  it('cria um admin que consegue fazer login', async () => {
    await seedAdmin(config);

    const { user } = await authService.login({ username: 'admin', password: STRONG });

    expect(user.role).toBe('admin');
  });
});

describe('npm run seed:admin (processo de verdade)', () => {
  // Cada run() sobe um Node de verdade (e o spawnSync trava o worker até ele
  // terminar). Com a máquina ocupada, isso passa dos 5 s padrão do Jest.
  const PROCESS_TIMEOUT = 20_000;

  // cwd em uma pasta temporária para o .env local não interferir.
  const run = (overrides = {}) =>
    spawnSync(process.execPath, [SCRIPT], {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        MONGODB_URI: db.uri(),
        JWT_SECRET: process.env.JWT_SECRET,
        ...env(overrides),
      },
    });

  it(
    'cria o admin na primeira execução e não faz nada na segunda',
    async () => {
      const first = run();
      const second = run();

      expect(first.status).toBe(0);
      expect(first.stdout).toMatch(/criado/);
      expect(second.status).toBe(0);
      expect(second.stdout).toMatch(/já existe/);
      await expect(User.countDocuments({ role: 'admin' })).resolves.toBe(1);
    },
    PROCESS_TIMEOUT,
  );

  it(
    'encerra com erro e diz o que falta, sem criar nada',
    async () => {
      const result = run({ ADMIN_PASSWORD: '' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('ADMIN_PASSWORD');
      await expect(User.countDocuments()).resolves.toBe(0);
    },
    PROCESS_TIMEOUT,
  );

  it(
    'recusa senha fraca em produção sem mostrar a senha',
    async () => {
      const result = run({ NODE_ENV: 'production', ADMIN_PASSWORD: 'admin123' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('ADMIN_PASSWORD');
      expect(result.stdout + result.stderr).not.toContain('admin123');
      await expect(User.countDocuments()).resolves.toBe(0);
    },
    PROCESS_TIMEOUT,
  );
});
