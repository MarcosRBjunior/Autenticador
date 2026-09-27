const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../src/middlewares/validate');
const { errorHandler } = require('../src/middlewares/errorHandler');

const schema = z.object({ name: z.string().trim().min(2) });

const app = express();
app.use(express.json());
app.post('/echo', validate(schema), (req, res) => res.json(req.body));
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
});
