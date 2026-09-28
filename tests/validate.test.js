const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../src/middlewares/validate');
const { errorHandler } = require('../src/middlewares/errorHandler');

const schema = z.object({ name: z.string().trim().min(2) });
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
const paramsSchema = z.object({ id: z.string().regex(/^\d+$/) });

const app = express();
app.use(express.json());
app.post('/echo', validate(schema), (req, res) => res.json(req.body));
app.get('/query', validate(querySchema, 'query'), (req, res) => res.json(req.validated.query));
app.get('/items/:id', validate(paramsSchema, 'params'), (req, res) =>
  res.json(req.validated.params),
);
app.use(errorHandler);

describe('validate', () => {
  it('entrega ao handler o body já validado e transformado', async () => {
    const res = await request(app).post('/echo').send({ name: '  Ana  ', extra: 'x' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Ana' });
  });

  it('responde 400 VALIDATION_ERROR com os erros por campo', async () => {
    const res = await request(app).post('/echo').send({ name: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details)).toEqual(['name']);
  });

  // No Express 5, req.body fica undefined quando a requisição não tem corpo JSON.
  it('trata requisição sem corpo como body vazio e aponta os campos faltando', async () => {
    const res = await request(app).post('/echo');

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(['name']);
  });

  // No Express 5, req.query é somente leitura: o resultado vai para req.validated.
  describe('query e params', () => {
    it('entrega a query convertida em req.validated.query', async () => {
      const res = await request(app).get('/query?page=3&extra=x');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ page: 3 });
    });

    it('aplica os valores padrão quando a query vem vazia', async () => {
      const res = await request(app).get('/query');

      expect(res.body).toEqual({ page: 1 });
    });

    it('responde 400 com o campo da query inválido', async () => {
      const res = await request(app).get('/query?page=0');

      expect(res.status).toBe(400);
      expect(Object.keys(res.body.error.details)).toEqual(['page']);
    });

    it('valida os parâmetros da rota em req.validated.params', async () => {
      const ok = await request(app).get('/items/42');
      const bad = await request(app).get('/items/abc');

      expect(ok.body).toEqual({ id: '42' });
      expect(bad.status).toBe(400);
      expect(Object.keys(bad.body.error.details)).toEqual(['id']);
    });
  });
});
