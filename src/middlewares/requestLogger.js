const { randomUUID } = require('node:crypto');
const pinoHttp = require('pino-http');

// Aceita o id enviado pelo cliente (ou por um proxy) só se for curto e simples,
// para não deixar entrar no log texto arbitrário.
const VALID_REQUEST_ID = /^[\w.-]{1,128}$/;

function genReqId(req, res) {
  const incoming = req.headers['x-request-id'];
  const id = VALID_REQUEST_ID.test(incoming ?? '') ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

function customLogLevel(req, res, err) {
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

function createRequestLogger(logger) {
  return pinoHttp({ logger, genReqId, customLogLevel });
}

module.exports = { createRequestLogger };
