const nodemailer = require('nodemailer');
const env = require('../config/env');
const { logger } = require('../utils/logger');
const templates = require('./mailTemplates');

// Teto de cada envio. Ele acontece dentro da requisição (na Vercel, uma
// promise solta depois da resposta pode não terminar), então um SMTP lento não
// pode segurar o cadastro ou o "esqueci a senha".
const SEND_TIMEOUT_MS = 10_000;

// D-01: nos testes nada sai da máquina; com SMTP_HOST, o provedor configurado;
// em desenvolvimento sem ele, uma conta descartável do Ethereal.
async function createTransport() {
  if (env.NODE_ENV === 'test') return nodemailer.createTransport({ jsonTransport: true });

  if (env.SMTP_HOST) {
    const secure = env.SMTP_PORT === 465;
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      // O link de reset é um segredo: em produção, nada de SMTP sem TLS.
      requireTLS: env.NODE_ENV === 'production' && !secure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  const account = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    ...account.smtp,
    auth: { user: account.user, pass: account.pass },
  });
}

// Criado no primeiro envio e reaproveitado. Se a criação falhar (Ethereal fora
// do ar), o próximo envio tenta de novo.
let transporter;

function getTransporter() {
  transporter ??= createTransport().catch((err) => {
    transporter = undefined;
    throw err;
  });
  return transporter;
}

// Nunca lança: falha ou timeout vira log de erro e `false`, e quem chamou segue
// a requisição. O log leva só o tipo e o id do usuário, nunca o token, o link
// ou o endereço.
async function send({ kind, user, subject, text }) {
  const log = { kind, userId: user.id };
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Envio passou de ${SEND_TIMEOUT_MS / 1000} s`)),
      SEND_TIMEOUT_MS,
    );
  });

  try {
    const info = await Promise.race([
      getTransporter().then((t) =>
        t.sendMail({ from: env.MAIL_FROM, to: user.email, subject, text }),
      ),
      timeout,
    ]);
    // Só o Ethereal devolve um link para ver o e-mail enviado.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    logger.info(previewUrl ? { ...log, previewUrl } : log, 'E-mail enviado');
    return true;
  } catch (err) {
    logger.error({ err, ...log }, 'Falha ao enviar e-mail');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sendActivationEmail({ user, token, expiresInMinutes }) {
  const url = `${env.APP_URL}/api/v1/auth/activate/${encodeURIComponent(token)}`;
  return send({
    kind: 'activation',
    user,
    ...templates.activation({ username: user.username, url, expiresInMinutes }),
  });
}

function sendPasswordResetEmail({ user, token, expiresInMinutes }) {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    kind: 'password_reset',
    user,
    ...templates.passwordReset({ username: user.username, url, expiresInMinutes }),
  });
}

module.exports = { sendActivationEmail, sendPasswordResetEmail };
