const userRepository = require('../repositories/UserRepository');
const authTokenRepository = require('../repositories/AuthTokenRepository');
const AppError = require('../utils/AppError');
const { toTakenError } = require('../utils/takenErrors');

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

const notFound = () => new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');

async function getUser(viewer, id) {
  const user = await userRepository.findById(id, { fields: fieldsFor(viewer) });
  if (!user) throw notFound();
  return user;
}

// Só username e senha (RN-08: role tem rota própria). O hook do model refaz o
// hash e incrementa o tokenVersion quando a senha muda (RN-11).
async function updateUser(viewer, id, { username, password }) {
  const changes = Object.fromEntries(
    Object.entries({ username, password }).filter(([, value]) => value !== undefined),
  );

  let updated;
  try {
    updated = await userRepository.update(id, changes);
  } catch (err) {
    throw toTakenError(err);
  }
  if (!updated) throw notFound();

  // Relê com a projeção do perfil: a resposta segue a mesma lista de campos do GET.
  return getUser(viewer, id);
}

// D-13: hard delete, levando junto os auth_tokens do usuário.
//
// RN-09: um admin só sai se sobrar outro admin ativo. Checar e depois excluir
// não é atômico: dois admins excluindo um ao outro no mesmo instante poderiam
// zerar os admins. Uma transação sozinha não fecha isso (as duas leem a mesma
// contagem e excluem documentos diferentes, sem conflito); seria preciso que
// ambas escrevessem num documento de trava comum, o que exige replica set.
// Se acontecer, `npm run seed:admin` cria um admin de novo.
async function deleteUser(id) {
  const user = await userRepository.findById(id, { fields: 'role' });
  if (!user) throw notFound();

  if (user.role === 'admin' && (await userRepository.countActiveAdmins({ excludeId: id })) === 0) {
    throw new AppError(409, 'LAST_ADMIN', 'Não é possível excluir o último admin ativo');
  }

  // Tokens antes do usuário: se isto falhar, nada foi excluído e a requisição
  // pode ser repetida, sem deixar tokens órfãos.
  await authTokenRepository.deleteByUserId(id);
  // Excluído por outra requisição entre a leitura e aqui.
  if (!(await userRepository.delete(id))) throw notFound();
}

// D-09: no MVP a área administrativa é só um resumo com contadores.
function getStats() {
  return userRepository.stats();
}

module.exports = { listUsers, getUser, updateUser, deleteUser, getStats };
