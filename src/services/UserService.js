const userRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');

// D-08: o usuário comum vê só o username e a data de criação; o admin vê todos
// os campos não sensíveis. Listas do que pode sair, nunca do que esconder: um
// campo novo no model não vaza por engano. O _id sai sempre (identifica o recurso).
const FIELDS_BY_ROLE = {
  user: 'username createdAt',
  admin: 'username email role isActive createdAt updatedAt',
};

// Um perfil desconhecido cai na visão mais restrita.
const fieldsFor = (viewer) => FIELDS_BY_ROLE[viewer.role] ?? FIELDS_BY_ROLE.user;

function listUsers(viewer, { page, limit, search }) {
  return userRepository.list({ page, limit, search, fields: fieldsFor(viewer) });
}

async function getUser(viewer, id) {
  const user = await userRepository.findById(id, { fields: fieldsFor(viewer) });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');
  return user;
}

// D-09: no MVP a área administrativa é só um resumo com contadores.
function getStats() {
  return userRepository.stats();
}

module.exports = { listUsers, getUser, getStats };
