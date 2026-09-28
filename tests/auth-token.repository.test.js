const mongoose = require('mongoose');
const db = require('./helpers/db');
const AuthToken = require('../src/models/AuthToken');
const authTokenRepository = require('../src/repositories/AuthTokenRepository');

let counter = 0;
const createToken = (userId) => {
  counter += 1;
  return AuthToken.create({
    userId,
    type: 'password_reset',
    tokenHash: String(counter).padStart(64, '0'),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
};

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('AuthTokenRepository.deleteByUserId', () => {
  it('remove os tokens do usuário e mantém os dos outros', async () => {
    const ana = new mongoose.Types.ObjectId();
    const bia = new mongoose.Types.ObjectId();
    await createToken(ana);
    await createToken(ana);
    await createToken(bia);

    await expect(authTokenRepository.deleteByUserId(ana)).resolves.toBe(2);

    await expect(AuthToken.countDocuments({ userId: ana })).resolves.toBe(0);
    await expect(AuthToken.countDocuments({ userId: bia })).resolves.toBe(1);
  });

  it('devolve 0 quando o usuário não tem tokens', async () => {
    await expect(authTokenRepository.deleteByUserId(new mongoose.Types.ObjectId())).resolves.toBe(
      0,
    );
  });
});
