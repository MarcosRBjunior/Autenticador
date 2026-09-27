const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./config/env');
const { logger } = require('./utils/logger');
const AppError = require('./utils/AppError');
const { createRequestLogger } = require('./middlewares/requestLogger');
const { errorHandler } = require('./middlewares/errorHandler');
const apiRoutes = require('./routes/api.routes');

const app = express();

// O log de requisição vem primeiro para que o requestId exista também nas
// requisições rejeitadas pelos middlewares seguintes (ex.: JSON malformado).
app.use(createRequestLogger(logger));
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10kb' }));

app.use('/api/v1', apiRoutes);

app.use(() => {
  throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada');
});

app.use(errorHandler);

module.exports = app;
