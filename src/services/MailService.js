const nodemailer = require('nodemailer');
const env = require('../config/env');
const { logger } = require('../utils/logger');
const templates = require('./mailTemplates');

// Teto de cada envio. Quem chama espera o envio dentro da requisição ou o roda
// depois da resposta com waitUntil (utils/background.js), como o "esqueci a
// senha"; nos dois casos, um SMTP lento não pode prender a requisição nem a
// função da Vercel por muito tempo.
const SEND_TIMEOUT_MS = 10_000;

// Fecham a conexão SMTP que travar, além de o envio desistir no teto acima.
const SMTP_TIMEOUTS = {
  connectionTimeout: SEND_TIMEOUT_MS,
  greetingTimeout: SEND_TIMEOUT_MS,
  socketTimeout: SEND_TIMEOUT_MS,
};

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
      // Com `auth` presente, mesmo vazio, o nodemailer tenta o login. Sem
      // usuário (relay local, como o Mailpit), o envio vai sem autenticar.
      ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
      ...SMTP_TIMEOUTS,
    });
  }

  const account = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    ...account.smtp,
    auth: { user: account.user, pass: account.pass },
    ...SMTP_TIMEOUTS,
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

// Endereços que o servidor SMTP repete na resposta ("550 <ana@...>: rejected").
const EMAIL_ADDRESS = /[^\s<>"',;:]+@[^\s<>"',;:]+/g;

// Só os campos que dizem o motivo. O erro inteiro traria o destinatário em
// `rejected`, `rejectedErrors` e `response`.
const describeError = (err) => ({
  name: err.name,
  message: String(err.message).replace(EMAIL_ADDRESS, '[e-mail]'),
  code: err.code,
  responseCode: err.responseCode,
  command: err.command,
});

// Falha de envio nunca lança: vira log de erro e `false` ("envio não
// confirmado": num timeout, o e-mail ainda pode chegar depois), e quem chamou
// segue a requisição. Argumento inválido é erro de programação e lança. O log
// leva só o tipo e o id do usuário, nunca o token, o link ou o endereço.
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
    logger.error({ err: describeError(err), ...log }, 'Falha ao enviar e-mail');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sendActivationEmail({ user, token, expiresInMinutes }) {
  // Página que confirma com um POST: scanners de link dos provedores de e-mail
  // abrem o link (GET) sozinhos e não podem ativar a conta no lugar do dono.
  const url = `${env.APP_URL}/activate?token=${encodeURIComponent(token)}`;
  return send({
    kind: 'activation',
    user,
    ...templates.activation({ url, expiresInMinutes }),
  });
}

function sendPasswordResetEmail({ user, token, expiresInMinutes }) {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    kind: 'password_reset',
    user,
    ...templates.passwordReset({ url, expiresInMinutes }),
  });
}

module.exports = { sendActivationEmail, sendPasswordResetEmail };
