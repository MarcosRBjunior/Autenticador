const crypto = require('node:crypto');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const AuthToken = require('../src/models/AuthToken');
const authTokenService = require('../src/services/AuthTokenService');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const PARALLEL = 10;

const ana = new mongoose.Types.ObjectId();
const bia = new mongoose.Types.ObjectId();

const issueReset = (userId = ana) =>
  authTokenService.issue({ userId, type: 'password_reset', ttlMinutes: 30 });
const consumeReset = (token) => authTokenService.consume({ token, type: 'password_reset' });

beforeAll(async () => {
  await db.connect();
  await AuthToken.init();
});
afterEach(db.clear);
afterAll(db.close);

describe('AuthTokenService.issue', () => {
  it('devolve um token aleatório de 256 bits e grava só o hash dele', async () => {
    const token = await issueReset();

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const stored = await AuthToken.find().lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      userId: ana,
      type: 'password_reset',
      tokenHash: sha256(token),
    });
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('sorteia um token diferente a cada chamada', async () => {
    const first = await issueReset(ana);
    const second = await issueReset(bia);

    expect(first).not.toBe(second);
  });

  it('faz o token valer pelo tempo pedido', async () => {
    const before = Date.now();
    await authTokenService.issue({ userId: ana, type: 'activation', ttlMinutes: 1440 });

    const { expiresAt } = await AuthToken.findOne().lean();
    const day = 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + day);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + day);
  });

  // Só o link mais recente vale: um e-mail antigo esquecido na caixa não serve.
  it('invalida o token anterior do mesmo tipo que ainda não foi usado', async () => {
    const old = await issueReset();
    const current = await issueReset();

    await expect(consumeReset(old)).resolves.toBeNull();
    await expect(consumeReset(current)).resolves.toEqual(ana);
  });

  it('não mexe nos tokens de outro tipo nem nos de outro usuário', async () => {
    const activation = await authTokenService.issue({
      userId: ana,
      type: 'activation',
      ttlMinutes: 1440,
    });
    const biaReset = await issueReset(bia);

    await issueReset(ana);

    await expect(
      authTokenService.consume({ token: activation, type: 'activation' }),
    ).resolves.toEqual(ana);
    await expect(consumeReset(biaReset)).resolves.toEqual(bia);
  });
});

describe('AuthTokenService.consume', () => {
  it('devolve o dono do token uma vez só', async () => {
    const token = await issueReset();

    await expect(consumeReset(token)).resolves.toEqual(ana);
    await expect(consumeReset(token)).resolves.toBeNull();
  });

  it('recusa o token de outro tipo sem gastá-lo', async () => {
    const token = await authTokenService.issue({
      userId: ana,
      type: 'activation',
      ttlMinutes: 1440,
    });

    await expect(consumeReset(token)).resolves.toBeNull();
    await expect(authTokenService.consume({ token, type: 'activation' })).resolves.toEqual(ana);
  });

  // O TTL do Mongo apaga o documento só na varredura seguinte (~60 s).
  it('recusa o token expirado que o Mongo ainda não apagou', async () => {
    const token = await issueReset();
    await AuthToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    await expect(consumeReset(token)).resolves.toBeNull();
  });

  it('recusa um token que nunca foi emitido', async () => {
    await issueReset();

    await expect(consumeReset('f'.repeat(64))).resolves.toBeNull();
  });

  it('com vários pedidos simultâneos, só um consegue usar o token', async () => {
    const token = await issueReset();
    // O pool do driver começa com uma conexão só e os pedidos acabariam em
    // fila. Com as conexões já abertas, as leituras correm em paralelo, e um
    // "ler e depois marcar" deixaria mais de um passar.
    await Promise.all(Array.from({ length: PARALLEL }, () => AuthToken.findOne().lean()));

    const results = await Promise.all(Array.from({ length: PARALLEL }, () => consumeReset(token)));

    expect(results.filter(Boolean)).toEqual([ana]);
  });
});
