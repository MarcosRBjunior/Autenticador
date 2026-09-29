const AuthToken = require('../models/AuthToken');

function create(data) {
  return AuthToken.create(data);
}

// Os tokens usados ficam (o TTL do Mongo apaga depois); só os que ainda
// valeriam saem.
async function deleteUnused({ userId, type }) {
  await AuthToken.deleteMany({ userId, type, usedAt: null });
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

module.exports = { create, deleteUnused, consume, deleteByUserId };
