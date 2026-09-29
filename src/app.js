const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { logger } = require('./utils/logger');
const AppError = require('./utils/AppError');
const { createRequestLogger } = require('./middlewares/requestLogger');
const { authGuard } = require('./middlewares/authGuard');
const { errorHandler } = require('./middlewares/errorHandler');
const apiRoutes = require('./routes/api.routes');
const pageRoutes = require('./routes/page.routes');

const app = express();

app.set('view engine', 'ejs');
// Caminho absoluto: funciona também na função da Vercel.
app.set('views', path.join(__dirname, 'views'));

// Atrás de proxy (Vercel), req.ip só é o IP real do cliente se o Express
// confiar no X-Forwarded-For. O rate limit depende disso.
app.set('trust proxy', env.TRUST_PROXY);

// O log de requisição vem primeiro para que o requestId exista também nas
// requisições rejeitadas pelos middlewares seguintes (ex.: JSON malformado).
app.use(createRequestLogger(logger));
app.use(helmet());
// credentials: o front em outra origem manda o cookie access_token. O cors
// responde o preflight (OPTIONS) sozinho, antes do guard.
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
// CSS, fontes e o script do olho da senha são públicos: vêm antes do guard.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Tudo abaixo exige token, exceto a allowlist de middlewares/authGuard.js.
// Vem antes do 404 de propósito: rota inexistente sem token também dá 401.
app.use(authGuard);

app.use('/api/v1', apiRoutes);
app.use(pageRoutes);

app.use(() => {
  throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada');
});

app.use(errorHandler);

module.exports = app;
