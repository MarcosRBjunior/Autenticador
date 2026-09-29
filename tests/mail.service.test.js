const ORIGINAL_ENV = { ...process.env };

const user = { id: '665f1c2e8b3a4d0012345678', username: 'ana', email: 'ana@example.com' };

const PRODUCTION = {
  NODE_ENV: 'production',
  APP_URL: 'https://auth.example.com',
  MAIL_FROM: 'Auth System <no-reply@auth.example.com>',
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '587',
  SMTP_USER: 'resend',
  SMTP_PASS: 're_chave_de_teste',
};

// Mesmo formato que o nodemailer.createTestAccount() devolve.
const ETHEREAL_ACCOUNT = {
  user: 'ana.silva@ethereal.email',
  pass: 'senha-ethereal',
  smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
  imap: { host: 'imap.ethereal.email', port: 993, secure: true },
  pop3: { host: 'pop3.ethereal.email', port: 995, secure: true },
  web: 'https://ethereal.email',
};

// Mesmo formato que o sendMail do transporte SMTP devolve.
const smtpInfo = (response = '250 Accepted') => ({
  accepted: ['ana@example.com'],
  rejected: [],
  ehlo: ['PIPELINING', '8BITMIME', 'SMTPUTF8', 'AUTH LOGIN PLAIN'],
  envelopeTime: 12,
  messageTime: 15,
  messageSize: 612,
  response,
  envelope: { from: 'no-reply@example.com', to: ['ana@example.com'] },
  messageId: '<a1b2c3@example.com>',
});

// Mesmo formato dos erros do smtp-connection do nodemailer (_formatError): a
// resposta do servidor vai no fim da mensagem.
const smtpError = (message, code, response, command) =>
  Object.assign(new Error(`${message}: ${response}`), {
    code,
    response,
    responseCode: Number(response.slice(0, 3)),
    command,
  });

// A config é lida no require e o transporte fica guardado depois do primeiro
// envio, então cada cenário carrega o MailService do zero.
function loadMailService(envOverrides = {}) {
  jest.resetModules();
  Object.assign(process.env, envOverrides);
  const nodemailer = require('nodemailer');
  const { logger } = require('../src/utils/logger');
  // Fora do NODE_ENV=test o logger escreveria no terminal.
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
  const mailService = require('../src/services/MailService');
  return { mailService, nodemailer, logger };
}

// Espiona o transporte que o MailService criar. Sem `sendMail`, o envio passa
// pelo transporte de verdade.
function watchTransport(nodemailer, sendMail) {
  const createTransport = nodemailer.createTransport;
  const watched = {};
  jest.spyOn(nodemailer, 'createTransport').mockImplementation((options) => {
    const transporter = createTransport(options);
    watched.options = options;
    watched.sendMail = jest.spyOn(transporter, 'sendMail');
    if (sendMail) watched.sendMail.mockImplementation(sendMail);
    return transporter;
  });
  return watched;
}

const sentMessage = (transport) => transport.sendMail.mock.calls[0][0];

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('MailService', () => {
  describe('mensagens', () => {
    it('manda a ativação para o e-mail do usuário, com o link da API', async () => {
      const { mailService, nodemailer } = loadMailService();
      const transport = watchTransport(nodemailer);

      const sent = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });

      expect(sent).toBe(true);
      expect(sentMessage(transport)).toEqual({
        from: 'Auth System <no-reply@example.com>',
        to: 'ana@example.com',
        subject: expect.stringMatching(/ativ/i),
        text: expect.stringContaining('\nhttp://localhost:3000/api/v1/auth/activate/tok3n\n'),
      });
      expect(sentMessage(transport).text).toContain('24 horas');
    });

    it('manda o reset para o e-mail do usuário, com o link da página de nova senha', async () => {
      const { mailService, nodemailer } = loadMailService();
      const transport = watchTransport(nodemailer);

      const sent = await mailService.sendPasswordResetEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 30,
      });

      expect(sent).toBe(true);
      expect(sentMessage(transport)).toEqual({
        from: 'Auth System <no-reply@example.com>',
        to: 'ana@example.com',
        subject: expect.stringMatching(/senha/i),
        text: expect.stringContaining('\nhttp://localhost:3000/reset-password?token=tok3n\n'),
      });
      expect(sentMessage(transport).text).toContain('30 minutos');
    });

    it('codifica o token no link', async () => {
      const { mailService, nodemailer } = loadMailService();
      const transport = watchTransport(nodemailer);

      await mailService.sendPasswordResetEmail({ user, token: 'a/b+c=', expiresInMinutes: 30 });

      expect(sentMessage(transport).text).toContain('/reset-password?token=a%2Fb%2Bc%3D\n');
    });
  });

  describe('transporte', () => {
    it('nos testes, nunca sai da máquina, mesmo com SMTP configurado', async () => {
      const { mailService, nodemailer } = loadMailService({
        SMTP_HOST: 'smtp.resend.com',
        SMTP_USER: 'resend',
        SMTP_PASS: 're_chave_de_teste',
      });
      const transport = watchTransport(nodemailer);

      await mailService.sendActivationEmail({ user, token: 'tok3n', expiresInMinutes: 1440 });

      expect(transport.options).toEqual({ jsonTransport: true });
    });

    it('em produção, usa o SMTP configurado e exige TLS', async () => {
      const { mailService, nodemailer, logger } = loadMailService(PRODUCTION);
      const transport = watchTransport(nodemailer, async () => smtpInfo());

      const sent = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });

      expect(sent).toBe(true);
      expect(transport.options).toEqual({
        host: 'smtp.resend.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'resend', pass: 're_chave_de_teste' },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });
      expect(sentMessage(transport)).toMatchObject({
        from: 'Auth System <no-reply@auth.example.com>',
        text: expect.stringContaining('\nhttps://auth.example.com/api/v1/auth/activate/tok3n\n'),
      });
      expect(logger.info).toHaveBeenCalledWith(
        { kind: 'activation', userId: user.id },
        expect.any(String),
      );
    });

    it('na porta 465, usa TLS desde a conexão', async () => {
      const { mailService, nodemailer } = loadMailService({ ...PRODUCTION, SMTP_PORT: '465' });
      const transport = watchTransport(nodemailer, async () => smtpInfo());

      await mailService.sendActivationEmail({ user, token: 'tok3n', expiresInMinutes: 1440 });

      expect(transport.options).toMatchObject({ port: 465, secure: true, requireTLS: false });
    });

    it('em desenvolvimento, sem SMTP_HOST, envia pelo Ethereal e loga onde ver o e-mail', async () => {
      const { mailService, nodemailer, logger } = loadMailService({
        NODE_ENV: 'development',
        SMTP_HOST: '',
      });
      jest.spyOn(nodemailer, 'createTestAccount').mockResolvedValue(ETHEREAL_ACCOUNT);
      const transport = watchTransport(nodemailer, async () =>
        smtpInfo('250 Accepted [STATUS=new MSGID=ZmFrZS1tc2dpZA]'),
      );

      const sent = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });

      expect(sent).toBe(true);
      expect(transport.options).toMatchObject({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: 'ana.silva@ethereal.email', pass: 'senha-ethereal' },
      });
      expect(logger.info).toHaveBeenCalledWith(
        {
          kind: 'activation',
          userId: user.id,
          previewUrl: 'https://ethereal.email/message/ZmFrZS1tc2dpZA',
        },
        expect.any(String),
      );
    });

    it('cria a conta no Ethereal uma vez só', async () => {
      const { mailService, nodemailer } = loadMailService({
        NODE_ENV: 'development',
        SMTP_HOST: '',
      });
      const createTestAccount = jest
        .spyOn(nodemailer, 'createTestAccount')
        .mockResolvedValue(ETHEREAL_ACCOUNT);
      watchTransport(nodemailer, async () => smtpInfo());

      await mailService.sendActivationEmail({ user, token: 'tok3n', expiresInMinutes: 1440 });
      await mailService.sendPasswordResetEmail({ user, token: 'tok3n', expiresInMinutes: 30 });

      expect(createTestAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('falhas', () => {
    it('devolve false e loga o motivo, sem o token, quando o SMTP recusa o login', async () => {
      const { mailService, nodemailer, logger } = loadMailService();
      const authError = smtpError(
        'Invalid login',
        'EAUTH',
        '535 Authentication failed',
        'AUTH PLAIN',
      );
      watchTransport(nodemailer, async () => {
        throw authError;
      });

      const sent = await mailService.sendPasswordResetEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 30,
      });

      expect(sent).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        {
          err: {
            name: 'Error',
            message: 'Invalid login: 535 Authentication failed',
            code: 'EAUTH',
            responseCode: 535,
            command: 'AUTH PLAIN',
          },
          kind: 'password_reset',
          userId: user.id,
        },
        expect.any(String),
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('tok3n');
    });

    it('não loga o endereço quando o servidor recusa o destinatário', async () => {
      const { mailService, nodemailer, logger } = loadMailService();
      const response = '550 5.1.1 <ana@example.com>: Recipient address rejected';
      const recipientError = Object.assign(
        smtpError('Recipient command failed', 'EENVELOPE', response, 'RCPT TO'),
        { recipient: 'ana@example.com' },
      );
      const envelopeError = Object.assign(
        smtpError(
          "Can't send mail - all recipients were rejected",
          'EENVELOPE',
          response,
          'RCPT TO',
        ),
        { rejected: ['ana@example.com'], rejectedErrors: [recipientError] },
      );
      watchTransport(nodemailer, async () => {
        throw envelopeError;
      });

      const sent = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });

      expect(sent).toBe(false);
      const [[logged]] = logger.error.mock.calls;
      expect(logged.err).toMatchObject({ code: 'EENVELOPE', responseCode: 550 });
      expect(JSON.stringify(logged)).not.toContain('ana@example.com');
    });

    it('desiste depois de 10 s sem resposta do servidor', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      const { mailService, nodemailer, logger } = loadMailService();
      watchTransport(nodemailer, () => new Promise(() => {}));

      let result = 'pendente';
      mailService
        .sendPasswordResetEmail({ user, token: 'tok3n', expiresInMinutes: 30 })
        .then((sent) => {
          result = sent;
        });

      await jest.advanceTimersByTimeAsync(9_999);
      expect(result).toBe('pendente');

      await jest.advanceTimersByTimeAsync(1);
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'password_reset', userId: user.id }),
        expect.any(String),
      );
    });

    it('não deixa o timer do limite pendurado depois de enviar', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      const { mailService, nodemailer } = loadMailService();
      watchTransport(nodemailer);

      await mailService.sendActivationEmail({ user, token: 'tok3n', expiresInMinutes: 1440 });

      expect(jest.getTimerCount()).toBe(0);
    });

    it('com o Ethereal fora do ar, devolve false e tenta de novo no envio seguinte', async () => {
      const { mailService, nodemailer } = loadMailService({
        NODE_ENV: 'development',
        SMTP_HOST: '',
      });
      jest
        .spyOn(nodemailer, 'createTestAccount')
        .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.nodemailer.com'))
        .mockResolvedValueOnce(ETHEREAL_ACCOUNT);
      watchTransport(nodemailer, async () => smtpInfo());

      const first = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });
      const second = await mailService.sendActivationEmail({
        user,
        token: 'tok3n',
        expiresInMinutes: 1440,
      });

      expect(first).toBe(false);
      expect(second).toBe(true);
    });
  });
});
