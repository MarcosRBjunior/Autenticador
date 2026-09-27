const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const AppError = require('../src/utils/AppError');
const { errorHandler } = require('../src/middlewares/errorHandler');

// App mínimo: cada teste registra a rota que lança o erro que quer verificar.
function appThatThrows(handler) {
  const app = express();
  app.use(express.json());
  app.post('/boom', handler);
  app.use(errorHandler);
  return app;
}

describe('AppError', () => {
  it('carrega status, code, message e details', () => {
    const err = new AppError(409, 'USERNAME_TAKEN', 'Username já cadastrado', {
      field: 'username',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'AppError',
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username já cadastrado',
      details: { field: 'username' },
    });
  });
});

describe('errorHandler', () => {
  it('converte AppError no formato padrão com o status do erro', async () => {
    const app = appThatThrows(() => {
      throw new AppError(403, 'FORBIDDEN', 'Acesso negado');
    });

    const res = await request(app).post('/boom');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Acesso negado' } });
  });

  it('inclui details quando o AppError traz', async () => {
    const app = appThatThrows(() => {
      throw new AppError(400, 'INVALID_INPUT', 'Dados inválidos', { field: 'email' });
    });

    const res = await request(app).post('/boom');

    expect(res.body.error.details).toEqual({ field: 'email' });
  });

  // Substitui o asyncHandler: o Express 5 já encaminha promessas rejeitadas.
  it('trata erro lançado dentro de handler async', async () => {
    const app = appThatThrows(async () => {
      await Promise.resolve();
      throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');
    });

    const res = await request(app).post('/boom');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Usuário não encontrado' } });
  });

  it('converte erro de validação do zod em 400 com os erros por campo', async () => {
    const schema = z.object({ username: z.string().min(3), email: z.email() });
    const app = appThatThrows((req) => {
      schema.parse(req.body);
    });

    const res = await request(app).post('/boom').send({ username: 'a', email: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details).sort()).toEqual(['email', 'username']);
  });

  it('converte chave duplicada do Mongo em 409 sem expor o valor', async () => {
    const app = appThatThrows(() => {
      throw Object.assign(new Error('E11000 duplicate key error dup key: { email: "a@b.com" }'), {
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: 'a@b.com' },
      });
    });

    const res = await request(app).post('/boom');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', details: { fields: ['email'] } });
    expect(res.text).not.toContain('a@b.com');
  });

  it('converte JSON malformado em 400 INVALID_JSON', async () => {
    const app = appThatThrows((req, res) => res.json({}));

    const res = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('mantém o status de erros HTTP 4xx do Express, como charset não suportado', async () => {
    const app = appThatThrows((req, res) => res.json({}));

    const res = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('responde 500 genérico para erros inesperados, sem mensagem interna nem stack', async () => {
    const app = appThatThrows(() => {
      throw new Error('conexão com o banco caiu em db.js:42');
    });

    const res = await request(app).post('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    });
    expect(res.text).not.toMatch(/db\.js|at .+\.js/);
  });

  describe('integração com o log de requisição', () => {
    // O pino-http lê res.err quando a resposta termina; este espião faz o mesmo.
    async function resErrAfter(handler) {
      let captured = 'não terminou';
      const app = express();
      app.use((req, res, next) => {
        res.on('finish', () => {
          captured = res.err;
        });
        next();
      });
      app.post('/boom', handler);
      app.use(errorHandler);

      await request(app).post('/boom');
      return captured;
    }

    it('entrega o erro 5xx em res.err para sair no log com stack', async () => {
      const boom = new Error('falha inesperada');

      const captured = await resErrAfter(() => {
        throw boom;
      });

      expect(captured).toBe(boom);
    });

    it('não marca erros 4xx como falha do servidor', async () => {
      const captured = await resErrAfter(() => {
        throw new AppError(404, 'NOT_FOUND', 'Não encontrado');
      });

      expect(captured).toBeUndefined();
    });
  });
});
