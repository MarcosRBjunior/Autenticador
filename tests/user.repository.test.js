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

describe('UserRepository.countAdmins', () => {
  it('conta só os admins', async () => {
    await createUser({ role: 'admin' });
    await createUser({ username: 'bia', email: 'bia@example.com', role: 'admin' });
    await createUser({ username: 'caio', email: 'caio@example.com' });

    await expect(userRepository.countAdmins()).resolves.toBe(2);
  });
});
