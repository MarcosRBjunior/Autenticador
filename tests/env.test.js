const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// env.js encerra o processo quando a configuração é inválida, então cada
// cenário roda em um processo filho para não derrubar o Jest.
const loadEnv = (overrides) =>
  spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: root,
    env: { ...process.env, ...overrides },
    encoding: 'utf8',
  });

describe('config/env', () => {
  it('carrega quando as variáveis obrigatórias são válidas', () => {
    const result = loadEnv({});

    expect(result.status).toBe(0);
  });

  it.each(['MONGODB_URI', 'JWT_SECRET'])('encerra o processo quando %s está vazia', (name) => {
    const result = loadEnv({ [name]: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres', () => {
    const result = loadEnv({ JWT_SECRET: 'curto' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET');
  });

  describe('TRUST_PROXY', () => {
    const readTrustProxy = (env) =>
      spawnSync(
        process.execPath,
        ['-e', "process.stdout.write(String(require('./src/config/env').TRUST_PROXY))"],
        { cwd: root, env, encoding: 'utf8' },
      );

    // Sem proxy na frente, confiar no X-Forwarded-For deixaria o cliente
    // escolher o próprio IP e escapar do rate limit.
    it('não confia em proxy por padrão', () => {
      // eslint-disable-next-line no-unused-vars
      const { TRUST_PROXY, ...withoutTrustProxy } = process.env;

      expect(readTrustProxy(withoutTrustProxy).stdout).toBe('0');
    });

    it('aceita o número de proxies na frente do app', () => {
      expect(readTrustProxy({ ...process.env, TRUST_PROXY: '1' }).stdout).toBe('1');
    });

    it.each(['-1', 'sim'])('rejeita TRUST_PROXY=%s', (value) => {
      const result = loadEnv({ TRUST_PROXY: value });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('TRUST_PROXY');
    });
  });

  describe('CORS_ORIGIN', () => {
    const readCorsOrigin = (value) =>
      JSON.parse(
        spawnSync(
          process.execPath,
          ['-e', "process.stdout.write(JSON.stringify(require('./src/config/env').CORS_ORIGIN))"],
          { cwd: root, env: { ...process.env, CORS_ORIGIN: value }, encoding: 'utf8' },
        ).stdout,
      );

    it('vira uma lista de origens', () => {
      expect(readCorsOrigin('http://localhost:5173')).toEqual(['http://localhost:5173']);
    });

    it('aceita várias origens separadas por vírgula, ignorando espaços', () => {
      expect(readCorsOrigin('http://localhost:5173, https://app.example.com ,')).toEqual([
        'http://localhost:5173',
        'https://app.example.com',
      ]);
    });
  });

  describe('e-mail', () => {
    // cwd em uma pasta temporária e ambiente montado do zero: nem o .env local
    // nem o setup dos testes preenchem o que cada cenário deixou de fora.
    const loadMailEnv = (overrides) =>
      spawnSync(
        process.execPath,
        [
          '-e',
          `const env = require(${JSON.stringify(path.join(root, 'src/config/env'))});
           const { APP_URL, MAIL_FROM, SMTP_PORT } = env;
           process.stdout.write(JSON.stringify({ APP_URL, MAIL_FROM, SMTP_PORT }));`,
        ],
        {
          cwd: os.tmpdir(),
          env: {
            PATH: process.env.PATH,
            MONGODB_URI: process.env.MONGODB_URI,
            JWT_SECRET: process.env.JWT_SECRET,
            ...overrides,
          },
          encoding: 'utf8',
        },
      );

    const production = {
      NODE_ENV: 'production',
      APP_URL: 'https://auth.example.com',
      MAIL_FROM: 'Auth System <no-reply@auth.example.com>',
      SMTP_HOST: 'smtp.resend.com',
      SMTP_USER: 'resend',
      SMTP_PASS: 're_chave_de_teste',
    };

    it('sobe em produção com o SMTP configurado', () => {
      expect(loadMailEnv(production).status).toBe(0);
    });

    // Sem elas, o cadastro criaria contas que nunca recebem o link de ativação.
    it.each(['APP_URL', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'])(
      'não sobe em produção sem %s',
      (name) => {
        const result = loadMailEnv({ ...production, [name]: '' });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(name);
      },
    );

    it('em desenvolvimento, funciona sem nada de e-mail configurado', () => {
      const result = loadMailEnv({ NODE_ENV: 'development' });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        APP_URL: 'http://localhost:3000',
        MAIL_FROM: expect.stringMatching(/<[^@\s]+@[^@\s]+>$/),
        SMTP_PORT: 587,
      });
    });

    it('em desenvolvimento, os links apontam para a porta local', () => {
      const result = loadMailEnv({ NODE_ENV: 'development', PORT: '4000' });

      expect(JSON.parse(result.stdout).APP_URL).toBe('http://localhost:4000');
    });

    // Os links são montados como `${APP_URL}/caminho`.
    it('tira a barra do fim de APP_URL', () => {
      const result = loadMailEnv({ ...production, APP_URL: 'https://auth.example.com/' });

      expect(JSON.parse(result.stdout).APP_URL).toBe('https://auth.example.com');
    });

    // O token viaja no link: em http, qualquer um na mesma rede o lê.
    it('em produção, recusa APP_URL sem https', () => {
      const result = loadMailEnv({ ...production, APP_URL: 'http://auth.example.com' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('APP_URL');
    });

    it.each([
      ['APP_URL', 'auth.example.com'],
      ['APP_URL', 'ftp://auth.example.com'],
      // `${APP_URL}/caminho` cairia dentro da query ou do fragmento.
      ['APP_URL', 'https://auth.example.com/?ref=email'],
      ['APP_URL', 'https://auth.example.com/#inicio'],
      ['SMTP_PORT', 'smtp'],
    ])('recusa %s=%s', (name, value) => {
      const result = loadMailEnv({ [name]: value });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(name);
    });
  });
});
