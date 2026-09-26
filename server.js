const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

const server = app.listen(env.PORT, () => {
  logger.info(`Servidor rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});

const shutdown = (signal) => {
  logger.info(`${signal} recebido, encerrando servidor...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
