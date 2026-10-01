// Entrada da Vercel. O builder de Express procura app, index ou server (na raiz
// ou em src/) e só aceita o arquivo que importa o express: sem este index.js
// ele pegaria o src/app.js, que não conecta ao banco. Localmente a entrada
// continua sendo o server.js (npm start / npm run dev).
const express = require('express');
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { logger } = require('./src/utils/logger');

const entry = express();
entry.disable('x-powered-by');

// Cada instância conecta na primeira requisição e as seguintes reaproveitam a
// conexão (o connectDB guarda o cache em global). Com o banco fora do ar a
// requisição segue mesmo assim: o /health responde 503 e a próxima tenta de novo.
entry.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'Falha ao conectar ao MongoDB');
  }
  next();
});

entry.use(app);

module.exports = entry;
