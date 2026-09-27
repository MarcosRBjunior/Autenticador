const request = require('supertest');
const app = require('../src/app');

// O /health agora depende do banco e é testado em health.test.js.

// Com token, a rota inexistente dá 404: coberto em auth-guard.test.js.
describe('rota inexistente sem token', () => {
  it('retorna 401 no formato padrão de erro, sem revelar se a rota existe', async () => {
    const res = await request(app).get('/nao-existe');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Faça login para acessar este recurso' },
    });
  });
});

describe('corpo JSON malformado', () => {
  it('retorna 400 INVALID_JSON, sem vazar stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'INVALID_JSON', message: 'JSON malformado' } });
    expect(res.text).not.toMatch(/at .+\.js/);
  });
});

describe('corpo grande demais', () => {
  it('retorna 413 acima do limite de 10kb', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .send({ texto: 'a'.repeat(11 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('requestId', () => {
  it('toda resposta traz o header X-Request-Id', async () => {
    const res = await request(app).get('/nao-existe');

    expect(res.headers['x-request-id']).toBeDefined();
  });
});
