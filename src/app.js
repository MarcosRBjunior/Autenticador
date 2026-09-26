const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./utils/logger');

const app = express();

// pino-http vem primeiro para que req.log exista também nas requisições
// rejeitadas pelos middlewares seguintes (ex.: JSON malformado).
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10kb' }));

module.exports = app;
