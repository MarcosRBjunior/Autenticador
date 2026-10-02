const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const { createEnvFile } = require('../scripts/create-env');
const { parseAdminConfig } = require('../scripts/seed-admin');

const EXAMPLE = path.join(__dirname, '..', '.env.example');

let dir;
let target;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-env-'));
  target = path.join(dir, '.env');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const create = () => createEnvFile({ example: EXAMPLE, target });

describe('npm run setup (scripts/create-env.js)', () => {
  it('cria o .env a partir do .env.example com JWT_SECRET e senha do admin novos', () => {
    const result = create();

    const env = dotenv.parse(fs.readFileSync(target, 'utf8'));
    expect(result.created).toBe(true);
    expect(env.JWT_SECRET).toMatch(/^[a-f0-9]{96}$/);
    expect(env.ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(16);
  });

  it('o .env gerado serve para subir o app e rodar o seed:admin', () => {
    create();

    const env = dotenv.parse(fs.readFileSync(target, 'utf8'));
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/auth-system');
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(() => parseAdminConfig({ ...env, NODE_ENV: 'development' })).not.toThrow();
  });

  it('muda só as duas variáveis: o resto fica igual ao exemplo', () => {
    create();

    const example = fs.readFileSync(EXAMPLE, 'utf8').split('\n');
    const created = fs.readFileSync(target, 'utf8').split('\n');
    const changed = created.filter((line, i) => line !== example[i]);
    expect(created).toHaveLength(example.length);
    expect(changed.map((line) => line.split('=')[0])).toEqual(['JWT_SECRET', 'ADMIN_PASSWORD']);
  });

  it('gera segredos diferentes a cada .env', () => {
    create();
    const first = dotenv.parse(fs.readFileSync(target, 'utf8'));
    fs.rmSync(target);
    create();
    const second = dotenv.parse(fs.readFileSync(target, 'utf8'));

    expect(second.JWT_SECRET).not.toBe(first.JWT_SECRET);
    expect(second.ADMIN_PASSWORD).not.toBe(first.ADMIN_PASSWORD);
  });

  it('nunca sobrescreve um .env que já existe', () => {
    fs.writeFileSync(target, 'JWT_SECRET=o-meu\n');

    const result = create();

    expect(result.created).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('JWT_SECRET=o-meu\n');
  });

  it('o .env só pode ser lido pelo dono do arquivo', () => {
    create();

    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });
});
