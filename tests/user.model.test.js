const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const User = require('../src/models/User');

const validUser = (overrides = {}) => ({
  username: 'ana',
  email: 'ana@example.com',
  password: 'senha-forte-123',
  ...overrides,
});

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('User model', () => {
  it('salva a senha como hash bcrypt, nunca em texto puro', async () => {
    const user = await User.create(validUser());

    const stored = await User.findById(user._id).select('+password').lean();

    expect(stored.password).toMatch(/^\$2b\$/);
    await expect(bcrypt.compare('senha-forte-123', stored.password)).resolves.toBe(true);
  });

  it('não refaz o hash quando outro campo muda', async () => {
    const user = await User.create(validUser());
    const { password: hashBefore } = await User.findById(user._id).select('+password').lean();

    user.username = 'ana.maria';
    await user.save();

    const { password: hashAfter } = await User.findById(user._id).select('+password').lean();
    expect(hashAfter).toBe(hashBefore);
  });

  // RN-11: trocar a senha invalida os JWTs emitidos antes.
  it('incrementa o tokenVersion quando a senha de um usuário existente muda', async () => {
    const user = await User.create(validUser());

    user.password = 'outra-senha-456';
    await user.save();

    const stored = await User.findById(user._id).lean();
    expect(stored.tokenVersion).toBe(1);
  });

  // US-13: o token antigo carrega a role antiga.
  it('incrementa o tokenVersion quando a role muda', async () => {
    const user = await User.create(validUser());

    user.role = 'admin';
    await user.save();

    const stored = await User.findById(user._id).lean();
    expect(stored.tokenVersion).toBe(1);
  });

  it('não refaz o hash quando só a role muda', async () => {
    const user = await User.create(validUser());
    const { password: hashBefore } = await User.findById(user._id).select('+password').lean();

    user.role = 'admin';
    await user.save();

    const { password: hashAfter } = await User.findById(user._id).select('+password').lean();
    expect(hashAfter).toBe(hashBefore);
  });

  it.each([
    ['outro campo muda', (user) => (user.username = 'ana.maria')],
    ['a role recebe o mesmo valor', (user) => (user.role = 'user')],
  ])('não incrementa o tokenVersion quando %s', async (_why, change) => {
    const user = await User.create(validUser());

    change(user);
    await user.save();

    const stored = await User.findById(user._id).lean();
    expect(stored.tokenVersion).toBe(0);
  });

  it('não devolve a senha em consultas comuns', async () => {
    const user = await User.create(validUser());

    const found = await User.findById(user._id).lean();

    expect(found).not.toHaveProperty('password');
  });

  it('aplica os valores padrão de role, isActive e tokenVersion', async () => {
    const user = await User.create(validUser());

    expect(user.role).toBe('user');
    expect(user.isActive).toBe(false);
    expect(user.tokenVersion).toBe(0);
  });

  it('rejeita role fora do enum', async () => {
    await expect(User.create(validUser({ role: 'superadmin' }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('exige e-mail', async () => {
    await expect(User.create(validUser({ email: undefined }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('guarda o e-mail em minúsculas', async () => {
    const user = await User.create(validUser({ email: 'Ana@Example.COM' }));

    expect(user.email).toBe('ana@example.com');
  });

  describe('unicidade', () => {
    beforeAll(() => User.init());

    it('recusa username repetido com caixa diferente', async () => {
      await User.create(validUser({ username: 'Ana' }));

      await expect(
        User.create(validUser({ username: 'ana', email: 'outra@example.com' })),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('recusa e-mail repetido', async () => {
      await User.create(validUser());

      await expect(User.create(validUser({ username: 'outra' }))).rejects.toMatchObject({
        code: 11000,
      });
    });
  });

  it('remove password, tokenVersion e __v do JSON', async () => {
    const user = await User.create(validUser());
    const withPassword = await User.findById(user._id).select('+password');

    const json = withPassword.toJSON();

    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('tokenVersion');
    expect(json).not.toHaveProperty('__v');
    expect(json).toMatchObject({ username: 'ana', email: 'ana@example.com', role: 'user' });
  });
});
