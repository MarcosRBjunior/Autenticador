const pino = require('pino');
const env = require('../config/env');

const SECRET_FIELDS = ['password', 'newPassword', 'token'];

// O curinga do pino cobre exatamente um nível (`*.password` não pega nem
// `password` no topo nem `req.body.password`), por isso cada campo sensível
// entra em três profundidades.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

function createLogger({ level, destination } = {}) {
  const options = { level, redact: REDACT_PATHS };
  return destination ? pino(options, destination) : pino(options);
}

const logger = createLogger({ level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL });

module.exports = { logger, createLogger };
