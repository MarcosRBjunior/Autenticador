const db = require('./helpers/db');
const RateLimit = require('../src/models/RateLimit');
const { MongoRateLimitStore } = require('../src/middlewares/rateLimitStore');

const WINDOW_MS = 15 * 60 * 1000;

// Cada store faz o papel de uma instância da função na Vercel.
function createStore(prefix = 'login', windowMs = WINDOW_MS) {
  const store = new MongoRateLimitStore(prefix);
  store.init({ windowMs });
  return store;
}

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('MongoRateLimitStore', () => {
  it('abre a janela na primeira tentativa', async () => {
    const store = createStore();
    const before = Date.now();

    const { totalHits, resetTime } = await store.increment('203.0.113.1');

    expect(totalHits).toBe(1);
    expect(resetTime.getTime()).toBeGreaterThanOrEqual(before + WINDOW_MS - 1000);
    expect(resetTime.getTime()).toBeLessThanOrEqual(Date.now() + WINDOW_MS + 1000);
  });

  it('soma as tentativas dentro da janela, sem mudar o fim dela', async () => {
    const store = createStore();
    const first = await store.increment('203.0.113.1');

    await store.increment('203.0.113.1');
    const third = await store.increment('203.0.113.1');

    expect(third.totalHits).toBe(3);
    expect(third.resetTime).toEqual(first.resetTime);
  });

  it('divide a contagem entre instâncias (stores diferentes, mesmo prefixo)', async () => {
    const instanceA = createStore('login');
    const instanceB = createStore('login');

    await instanceA.increment('203.0.113.1');
    const { totalHits } = await instanceB.increment('203.0.113.1');

    expect(totalHits).toBe(2);
  });

  it('não perde tentativas simultâneas, nem na primeira (upsert)', async () => {
    const instances = [createStore('login'), createStore('login')];

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => instances[i % 2].increment('203.0.113.1')),
    );

    const hits = results.map((result) => result.totalHits).sort((a, b) => a - b);
    expect(hits).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('não mistura limites de prefixos diferentes com a mesma chave', async () => {
    await createStore('register').increment('203.0.113.1');

    const { totalHits } = await createStore('login').increment('203.0.113.1');

    expect(totalHits).toBe(1);
  });

  it('não mistura chaves diferentes no mesmo limite', async () => {
    const store = createStore();
    await store.increment('203.0.113.1');

    const { totalHits } = await store.increment('203.0.113.2');

    expect(totalHits).toBe(1);
  });

  it('recomeça a contagem quando a janela já venceu', async () => {
    const store = createStore();
    await store.increment('203.0.113.1');
    await store.increment('203.0.113.1');
    // O TTL do Mongo só apaga o documento na próxima varredura (~60 s).
    await RateLimit.updateMany({}, { resetAt: new Date(Date.now() - 1000) });

    const { totalHits, resetTime } = await store.increment('203.0.113.1');

    expect(totalHits).toBe(1);
    expect(resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('decrement desconta uma tentativa', async () => {
    const store = createStore();
    await store.increment('203.0.113.1');
    await store.increment('203.0.113.1');

    await store.decrement('203.0.113.1');
    const { totalHits } = await store.increment('203.0.113.1');

    expect(totalHits).toBe(2);
  });

  it('decrement não cria contagem nem passa de zero', async () => {
    const store = createStore();

    await store.decrement('203.0.113.1');
    await store.decrement('203.0.113.1');

    expect(await RateLimit.countDocuments()).toBe(0);
    await store.increment('203.0.113.1');
    await store.decrement('203.0.113.1');
    await store.decrement('203.0.113.1');
    expect((await store.increment('203.0.113.1')).totalHits).toBe(1);
  });

  it('decrement não mexe numa janela vencida', async () => {
    const store = createStore();
    await store.increment('203.0.113.1');
    await RateLimit.updateMany({}, { resetAt: new Date(Date.now() - 1000) });

    await store.decrement('203.0.113.1');

    const [doc] = await RateLimit.find().lean();
    expect(doc.hits).toBe(1);
  });

  it('resetKey zera a contagem da chave', async () => {
    const store = createStore();
    await store.increment('203.0.113.1');
    await store.increment('203.0.113.1');

    await store.resetKey('203.0.113.1');

    expect((await store.increment('203.0.113.1')).totalHits).toBe(1);
  });

  it('guarda só o hash da chave, nunca o IP ou o e-mail', async () => {
    const store = createStore();

    await store.increment('203.0.113.1:ana@example.com');

    const [doc] = await RateLimit.find().lean();
    expect(doc._id).toMatch(/^login:[a-f0-9]{64}$/);
    expect(JSON.stringify(doc)).not.toMatch(/203\.0\.113\.1|ana@example\.com/);
  });

  it('o Mongo apaga a contagem quando a janela vence (índice TTL)', async () => {
    await RateLimit.init();

    const indexes = await RateLimit.collection.indexes();

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { resetAt: 1 }, expireAfterSeconds: 0 }),
    );
  });
});
