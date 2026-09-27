const { spawnSync } = require('node:child_process');
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
});
