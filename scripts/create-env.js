// Cria o .env de desenvolvimento a partir do .env.example, com JWT_SECRET e
// ADMIN_PASSWORD aleatórios. Uso: npm run setup. Nunca sobrescreve um .env.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Preenche só as variáveis que estão vazias no exemplo (`NOME=` sozinho na linha).
function fillEmpty(content, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${value}`),
    content,
  );
}

function createEnvFile({
  example = path.join(ROOT, '.env.example'),
  target = path.join(ROOT, '.env'),
} = {}) {
  const content = fillEmpty(fs.readFileSync(example, 'utf8'), {
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    ADMIN_PASSWORD: crypto.randomBytes(12).toString('base64url'),
  });

  try {
    // wx: falha se o arquivo já existe, sem janela entre conferir e gravar.
    // 0600: os segredos ficam legíveis só para o dono.
    fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err.code === 'EEXIST') return { created: false };
    throw err;
  }
  return { created: true };
}

if (require.main === module) {
  const { created } = createEnvFile();
  console.log(
    created
      ? '.env criado com JWT_SECRET e ADMIN_PASSWORD novos. A senha do admin está no .env.'
      : 'O .env já existe; nada foi alterado.',
  );
}

module.exports = { createEnvFile };
