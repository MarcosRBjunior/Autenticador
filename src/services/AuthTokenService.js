const crypto = require('node:crypto');
const authTokenRepository = require('../repositories/AuthTokenRepository');

// RN-10: tokens de uso único para reset de senha e ativação de conta. O token
// puro existe só no link enviado por e-mail; o banco guarda o SHA-256 dele, que
// basta porque o token já é aleatório (256 bits), sem precisar de bcrypt.
const TOKEN_BYTES = 32;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Só o link mais recente vale: o token novo substitui o anterior do mesmo tipo
// que ainda não foi usado.
async function issue({ userId, type, ttlMinutes }) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  await authTokenRepository.replaceUnused({
    userId,
    type,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
  });
  return token;
}

// Devolve o id do dono do token, ou null se ele não existe, já foi usado,
// expirou ou é de outro tipo.
async function consume({ token, type }) {
  const record = await authTokenRepository.consume({
    tokenHash: hash(token),
    type,
    now: new Date(),
  });
  return record?.userId ?? null;
}

module.exports = { issue, consume };
