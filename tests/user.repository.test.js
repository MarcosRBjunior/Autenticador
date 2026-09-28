const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const User = require('../src/models/User');
const userRepository = require('../src/repositories/UserRepository');

const createUser = (overrides = {}) =>
  User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    ...overrides,
  });

beforeAll(async () => {
  await db.connect();
  await User.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('UserRepository.findByUsernameOrEmail', () => {
  it('encontra pelo username sem diferenciar maiúsculas', async () => {
    await createUser({ username: 'Ana' });

    const found = await userRepository.findByUsernameOrEmail('ANA', 'nao-existe@example.com');

    expect(found.username).toBe('Ana');
  });

  it('encontra pelo e-mail sem diferenciar maiúsculas', async () => {
    await createUser();

    const found = await userRepository.findByUsernameOrEmail('nao-existe', 'Ana@Example.com');

    expect(found.email).toBe('ana@example.com');
  });

  it('devolve null quando nada bate', async () => {
    await createUser();

    const found = await userRepository.findByUsernameOrEmail('bia', 'bia@example.com');

    expect(found).toBeNull();
  });

  it('só traz a senha quando pedido', async () => {
    await createUser();

    const semSenha = await userRepository.findByUsernameOrEmail('ana', 'ana@example.com');
    const comSenha = await userRepository.findByUsernameOrEmail('ana', 'ana@example.com', {
      withPassword: true,
    });

    expect(semSenha.password).toBeUndefined();
    await expect(bcrypt.compare('senha-forte-123', comSenha.password)).resolves.toBe(true);
  });
});

describe('UserRepository.create', () => {
  it('grava o usuário com a senha em hash e devolve o documento', async () => {
    const user = await userRepository.create({
      username: 'ana',
      email: 'ana@example.com',
      password: 'senha-forte-123',
    });

    const { password } = await User.findById(user._id).select('+password').lean();
    expect(user.username).toBe('ana');
    expect(password).toMatch(/^\$2b\$/);
  });
});

describe('UserRepository.findById', () => {
  it('encontra o usuário sem a senha', async () => {
    const user = await createUser();

    const found = await userRepository.findById(user._id);

    expect(found.username).toBe('ana');
    expect(found.password).toBeUndefined();
  });

  it('devolve null para id inexistente', async () => {
    const found = await userRepository.findById(new mongoose.Types.ObjectId());

    expect(found).toBeNull();
  });

  it('aceita uma projeção específica', async () => {
    const user = await createUser();

    const found = await userRepository.findById(user._id, { fields: 'username createdAt' });

    expect(Object.keys(found.toJSON()).sort()).toEqual(['_id', 'createdAt', 'username']);
  });
});

describe('UserRepository.list', () => {
  it('pagina do mais novo para o mais antigo', async () => {
    for (const name of ['primeiro', 'segundo', 'terceiro']) {
      await createUser({ username: name, email: `${name}@example.com` });
    }

    const result = await userRepository.list({ page: 2, limit: 2 });

    expect(result).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(result.data.map((u) => u.username)).toEqual(['primeiro']);
  });

  it('busca por parte do username sem diferenciar maiúsculas', async () => {
    await createUser({ username: 'Mariana', email: 'mariana@example.com' });
    await createUser({ username: 'joao', email: 'joao@example.com' });

    const result = await userRepository.list({ search: 'ARIA' });

    expect(result.data.map((u) => u.username)).toEqual(['Mariana']);
    expect(result.total).toBe(1);
  });

  it('trata a busca como texto literal, não como regex', async () => {
    await createUser();

    const result = await userRepository.list({ search: '.*' });

    expect(result.total).toBe(0);
  });

  it('nunca devolve password nem tokenVersion', async () => {
    await createUser();

    const { data } = await userRepository.list();

    expect(data[0]).not.toHaveProperty('password');
    expect(data[0]).not.toHaveProperty('tokenVersion');
    expect(data[0]).toMatchObject({ username: 'ana', email: 'ana@example.com', role: 'user' });
  });

  it('aceita uma projeção específica', async () => {
    await createUser();

    const { data } = await userRepository.list({ fields: 'username createdAt' });

    expect(Object.keys(data[0]).sort()).toEqual(['_id', 'createdAt', 'username']);
  });
});

describe('UserRepository.update', () => {
  it('atualiza e refaz o hash quando a senha muda', async () => {
    const user = await createUser();

    const updated = await userRepository.update(user._id, { password: 'nova-senha-456' });

    const { password } = await User.findById(user._id).select('+password').lean();
    expect(updated.username).toBe('ana');
    await expect(bcrypt.compare('nova-senha-456', password)).resolves.toBe(true);
  });

  it('devolve null para id inexistente', async () => {
    const updated = await userRepository.update(new mongoose.Types.ObjectId(), { username: 'x' });

    expect(updated).toBeNull();
  });

  it('propaga o erro de username já usado', async () => {
    await createUser({ username: 'bia', email: 'bia@example.com' });
    const user = await createUser();

    await expect(userRepository.update(user._id, { username: 'BIA' })).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('UserRepository.delete', () => {
  it('remove o usuário e devolve true', async () => {
    const user = await createUser();

    await expect(userRepository.delete(user._id)).resolves.toBe(true);
    await expect(User.countDocuments()).resolves.toBe(0);
  });

  it('devolve false quando o usuário não existe', async () => {
    await expect(userRepository.delete(new mongoose.Types.ObjectId())).resolves.toBe(false);
  });
});

describe('UserRepository.stats', () => {
  it('conta o total, os admins e os inativos', async () => {
    await createUser({ role: 'admin', isActive: true });
    await createUser({ username: 'bia', email: 'bia@example.com', isActive: true });
    await createUser({ username: 'caio', email: 'caio@example.com' });

    await expect(userRepository.stats()).resolves.toEqual({
      totalUsers: 3,
      admins: 1,
      inactive: 1,
    });
  });

  it('devolve zeros com o banco vazio', async () => {
    await expect(userRepository.stats()).resolves.toEqual({
      totalUsers: 0,
      admins: 0,
      inactive: 0,
    });
  });
});

describe('UserRepository.countAdmins', () => {
  it('conta só os admins', async () => {
    await createUser({ role: 'admin' });
    await createUser({ username: 'bia', email: 'bia@example.com', role: 'admin' });
    await createUser({ username: 'caio', email: 'caio@example.com' });

    await expect(userRepository.countAdmins()).resolves.toBe(2);
  });
});

describe('UserRepository.countActiveAdmins', () => {
  it('conta só os admins ativos', async () => {
    await createUser({ role: 'admin', isActive: true });
    await createUser({ username: 'bia', email: 'bia@example.com', role: 'admin' });
    await createUser({ username: 'caio', email: 'caio@example.com', isActive: true });

    await expect(userRepository.countActiveAdmins()).resolves.toBe(1);
  });

  it('deixa de fora o id informado', async () => {
    const ana = await createUser({ role: 'admin', isActive: true });
    await createUser({ username: 'bia', email: 'bia@example.com', role: 'admin', isActive: true });

    await expect(userRepository.countActiveAdmins({ excludeId: ana._id })).resolves.toBe(1);
    await expect(userRepository.countActiveAdmins({ excludeId: ana.id })).resolves.toBe(1);
  });
});

describe('UserRepository.incrementTokenVersion', () => {
  it('soma 1 ao tokenVersion só do usuário informado', async () => {
    const ana = await createUser({ tokenVersion: 3 });
    const bia = await createUser({ username: 'bia', email: 'bia@example.com' });

    await userRepository.incrementTokenVersion(ana._id);

    expect((await User.findById(ana._id).lean()).tokenVersion).toBe(4);
    expect((await User.findById(bia._id).lean()).tokenVersion).toBe(0);
  });

  // Dois logouts ao mesmo tempo não podem se sobrescrever.
  it('é atômico com chamadas simultâneas', async () => {
    const ana = await createUser();

    await Promise.all([
      userRepository.incrementTokenVersion(ana.id),
      userRepository.incrementTokenVersion(ana.id),
    ]);

    expect((await User.findById(ana._id).lean()).tokenVersion).toBe(2);
  });
});
