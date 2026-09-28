const AuthToken = require('../models/AuthToken');

// O Mongo não tem chave estrangeira: ao excluir um usuário, os tokens dele
// saem por aqui. Devolve quantos foram removidos.
async function deleteByUserId(userId) {
  const { deletedCount } = await AuthToken.deleteMany({ userId });
  return deletedCount;
}

module.exports = { deleteByUserId };
