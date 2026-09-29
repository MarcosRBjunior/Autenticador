const AuthToken = require('../models/AuthToken');

const DUPLICATE_KEY = 11000;

function upsertUnused({ userId, type, tokenHash, expiresAt }) {
  return AuthToken.findOneAndUpdate(
    { userId, type, usedAt: null },
    { $set: { tokenHash, expiresAt } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

// Grava o token novo no lugar do não usado que o usuário tiver daquele tipo,
// numa operação só: uma falha na gravação não apaga o link que existia. Dois
// upserts simultâneos que não acham nada tentam inserir os dois, e o índice
// único parcial (ver models/AuthToken.js) barra o segundo; na nova tentativa
// ele acha o documento do primeiro e o substitui.
async function replaceUnused(data) {
  try {
    return await upsertUnused(data);
  } catch (err) {
    if (err?.code !== DUPLICATE_KEY) throw err;
    return upsertUnused(data);
  }
}

// Confere e marca como usado numa operação só: dois pedidos com o mesmo token
// não passam os dois. O filtro de expiresAt cobre o intervalo até o TTL do
// Mongo apagar o documento. Devolve null quando o token não vale.
function consume({ tokenHash, type, now }) {
  return AuthToken.findOneAndUpdate(
    { tokenHash, type, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
}

// O Mongo não tem chave estrangeira: ao excluir um usuário, os tokens dele
// saem por aqui. Devolve quantos foram removidos.
async function deleteByUserId(userId) {
  const { deletedCount } = await AuthToken.deleteMany({ userId });
  return deletedCount;
}

module.exports = { replaceUnused, consume, deleteByUserId };
