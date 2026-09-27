const mongoose = require('mongoose');
const db = require('./helpers/db');
const AuthToken = require('../src/models/AuthToken');

const validToken = (overrides = {}) => ({
  userId: new mongoose.Types.ObjectId(),
  type: 'password_reset',
  tokenHash: 'a'.repeat(64),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  ...overrides,
});

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('AuthToken model', () => {
  it('nasce sem usedAt', async () => {
    const token = await AuthToken.create(validToken());

    expect(token.usedAt).toBeNull();
  });

  it('rejeita tipo fora do enum', async () => {
    await expect(AuthToken.create(validToken({ type: 'magic_link' }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it.each(['userId', 'tokenHash', 'expiresAt'])('exige %s', async (field) => {
    await expect(AuthToken.create(validToken({ [field]: undefined }))).rejects.toThrow(
      mongoose.Error.ValidationError,
    );
  });

  it('recusa tokenHash repetido', async () => {
    await AuthToken.create(validToken());

    await expect(AuthToken.create(validToken({ type: 'activation' }))).rejects.toMatchObject({
      code: 11000,
    });
  });

  // O Mongo varre os TTLs a cada 60 s; esperar o documento sumir deixaria a
  // suíte lenta e instável. Basta garantir que o índice existe como deve.
  it('tem índice TTL que expira exatamente em expiresAt', async () => {
    const indexes = await AuthToken.collection.indexes();

    const ttl = indexes.find((index) => index.key.expiresAt === 1);

    expect(ttl).toMatchObject({ expireAfterSeconds: 0 });
  });
});
