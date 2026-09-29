// Sobe o app para o Playwright: Mongo em memória, e-mail sem rede
// (NODE_ENV=test usa o jsonTransport), uma usuária ativa e um admin. Só este servidor
// tem a rota /__e2e/last-activation-token?email=..., que entrega o último
// token de ativação enviado para aquele e-mail.
const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = Number(process.env.E2E_PORT ?? 3100);

async function start() {
  const mongod = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'e2e-only-secret-with-at-least-32-chars';
  process.env.APP_URL = `http://127.0.0.1:${PORT}`;

  const express = require('express');
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../src/models/User');
  await User.create({
    username: 'ana',
    email: 'ana@example.com',
    password: 'senha-forte-123',
    isActive: true,
  });
  await User.create({
    username: 'root',
    email: 'root@example.com',
    password: 'senha-forte-123',
    role: 'admin',
    isActive: true,
  });

  const mailService = require('../src/services/MailService');
  const sent = [];
  const sendActivationEmail = mailService.sendActivationEmail;
  mailService.sendActivationEmail = (args) => {
    sent.push(args);
    return sendActivationEmail(args);
  };

  const app = require('../src/app');
  const server = express();
  server.get('/__e2e/last-activation-token', (req, res) => {
    const email = String(req.query.email ?? '');
    res.json({ token: sent.findLast((m) => m.user.email === email)?.token ?? null });
  });
  server.use(app);
  server.listen(PORT, () => console.log(`E2E em http://127.0.0.1:${PORT}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
