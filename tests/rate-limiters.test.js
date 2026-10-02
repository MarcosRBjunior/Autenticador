const request = require('supertest');
const db = require('./helpers/db');
const RateLimit = require('../src/models/RateLimit');
const { MongoRateLimitStore } = require('../src/middlewares/rateLimitStore');
const app = require('../src/app');

const IP = '198.51.100.7';

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('rate limit com a contagem no Mongo (D-15)', () => {
  it('vale entre instâncias: a contagem de outra instância bloqueia esta', async () => {
    // Outra instância da função já contou 5 logins errados deste IP para "ana".
    const otherInstance = new MongoRateLimitStore('login');
    otherInstance.init({ windowMs: 15 * 60 * 1000 });
    for (let i = 0; i < 5; i++) await otherInstance.increment(`${IP}:ana`);

    const res = await request(app)
      .post('/api/v1/login')
      .set('X-Forwarded-For', IP)
      .send({ username: 'ana', password: 'qualquer' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('cada limite da rota conta à parte (por IP e por IP + e-mail)', async () => {
    await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', IP)
      .send({ email: 'ana@example.com' });

    const ids = (await RateLimit.find().lean()).map((doc) => doc._id.split(':')[0]).sort();
    expect(ids).toEqual(['forgot-password-account', 'forgot-password-ip']);
  });
});
