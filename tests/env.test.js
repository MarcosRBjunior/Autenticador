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
});
