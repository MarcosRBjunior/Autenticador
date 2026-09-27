const express = require('express');
const request = require('supertest');
const { createLogger } = require('../src/utils/logger');
const { createRequestLogger } = require('../src/middlewares/requestLogger');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Monta um app mínimo com o log de requisição gravando num array.
function buildApp() {
  const lines = [];
  const logger = createLogger({
    level: 'info',
    destination: { write: (chunk) => lines.push(JSON.parse(chunk)) },
  });

  const app = express();
  app.use(createRequestLogger(logger));
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.get('/bad', (req, res) => res.status(400).json({}));
  app.get('/fail', (req, res) => {
    res.err = new Error('falha interna');
    res.status(500).json({});
  });

  return { app, lines };
}

describe('log de requisição', () => {
  it('gera um requestId, devolve no header X-Request-Id e registra no log', async () => {
    const { app, lines } = buildApp();

    const res = await request(app).get('/ok');

    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(lines[0].req.id).toBe(res.headers['x-request-id']);
  });

  it('reaproveita um X-Request-Id válido enviado pelo cliente', async () => {
    const { app, lines } = buildApp();

    const res = await request(app).get('/ok').set('X-Request-Id', 'abc-123_trace.1');

    expect(res.headers['x-request-id']).toBe('abc-123_trace.1');
    expect(lines[0].req.id).toBe('abc-123_trace.1');
  });

  it.each([
    ['com caracteres estranhos', 'id com espaço"<script>'],
    ['longo demais', 'a'.repeat(129)],
  ])('ignora X-Request-Id %s e gera um novo', async (_why, value) => {
    const { app } = buildApp();

    const res = await request(app).get('/ok').set('X-Request-Id', value);

    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('não registra authorization nem cookie', async () => {
    const { app, lines } = buildApp();

    await request(app)
      .get('/ok')
      .set('Authorization', 'Bearer segredo')
      .set('Cookie', 'access_token=segredo');

    expect(JSON.stringify(lines)).not.toMatch(/segredo/);
  });

  it.each([
    ['/ok', 'info', 30],
    ['/bad', 'warn', 40],
    ['/fail', 'error', 50],
  ])('registra %s no nível %s', async (path, _name, level) => {
    const { app, lines } = buildApp();

    await request(app).get(path);

    expect(lines[0].level).toBe(level);
  });

  it('inclui o erro com stack quando a resposta é 5xx', async () => {
    const { app, lines } = buildApp();

    await request(app).get('/fail');

    expect(lines[0].err).toMatchObject({ message: 'falha interna' });
    expect(lines[0].err.stack).toBeDefined();
  });
});
