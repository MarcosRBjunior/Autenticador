const mongoose = require('mongoose');
const app = require('./src/app');
const env = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const { logger } = require('./src/utils/logger');

async function start() {
  await connectDB();
  logger.info('Conectado ao MongoDB');

  const server = app.listen(env.PORT, () => {
    logger.info(`Servidor rodando na porta ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} recebido, encerrando servidor...`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Falha ao iniciar: não foi possível conectar ao MongoDB');
  process.exit(1);
});
