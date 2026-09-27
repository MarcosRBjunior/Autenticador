const { STATUS_CODES } = require('node:http');
const { z } = require('zod');
const AppError = require('../utils/AppError');

// 415 → "Unsupported Media Type" → "UNSUPPORTED_MEDIA_TYPE"
const codeFromStatus = (status) =>
  (STATUS_CODES[status] ?? 'HTTP Error').toUpperCase().replace(/[^A-Z0-9]+/g, '_');

function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: z.flattenError(err).fieldErrors,
    };
  }
  // Chave única duplicada no Mongo: informa só os campos, nunca os valores.
  if (err?.code === 11000) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: 'Registro duplicado',
      details: { fields: Object.keys(err.keyPattern ?? {}) },
    };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'JSON malformado' };
  }
  // Erros HTTP do próprio Express/body-parser (413, 415...) indicam em
  // `expose` se a mensagem pode ir para o cliente.
  const status = err?.status ?? err?.statusCode;
  if (err?.expose && status >= 400 && status < 500) {
    return { status, code: codeFromStatus(status), message: err.message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, code, message, details } = toErrorResponse(err);

  // O pino-http registra res.err na linha da requisição, com stack e requestId.
  if (status >= 500) res.err = err;

  const body = details === undefined ? { code, message } : { code, message, details };
  res.status(status).json({ error: body });
}

module.exports = { errorHandler };
