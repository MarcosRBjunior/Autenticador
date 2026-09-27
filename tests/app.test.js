const request = require('supertest');
const app = require('../src/app');

// O /health agora depende do banco e é testado em health.test.js.

describe('rota inexistente', () => {
  it('retorna 404', async () => {
    const res = await request(app).get('/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Rota não encontrada' });
  });
});

describe('corpo JSON malformado', () => {
  it('retorna 400 em JSON, sem vazar stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.text).not.toMatch(/at .+\.js/);
  });
});
