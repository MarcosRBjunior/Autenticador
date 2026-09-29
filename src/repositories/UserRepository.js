const User = require('../models/User');

// Mesma collation do índice único de username (ver models/User.js).
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

// Lista do que pode sair, nunca do que deve ser escondido: um campo novo no
// model não vaza por engano.
const DEFAULT_LIST_FIELDS = 'username email role isActive createdAt updatedAt';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findByUsernameOrEmail(username, email, { withPassword = false } = {}) {
  const query = User.findOne({
    $or: [{ username }, { email: email.toLowerCase() }],
  }).collation(CASE_INSENSITIVE);
  return withPassword ? query.select('+password') : query;
}

// O model guarda o e-mail em minúsculas.
function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

// Sem fields traz o documento completo (menos a senha), como o middleware de
// autenticação precisa para conferir o tokenVersion.
function findById(id, { fields } = {}) {
  const query = User.findById(id);
  return fields ? query.select(fields) : query;
}

// create() passa pelo save(), então o hook de hash da senha roda.
function create(data) {
  return User.create(data);
}

async function list({ page = 1, limit = 20, search, fields = DEFAULT_LIST_FIELDS } = {}) {
  const filter = search ? { username: { $regex: escapeRegex(search), $options: 'i' } } : {};

  const [data, total] = await Promise.all([
    User.find(filter)
      .select(fields)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}

// Usa save() em vez de findByIdAndUpdate para o hook de hash da senha rodar.
async function update(id, data) {
  const user = await User.findById(id);
  if (!user) return null;
  user.set(data);
  await user.save();
  return user;
}

// Devolve false quando o usuário não existe mais.
async function activate(id) {
  const { matchedCount } = await User.updateOne({ _id: id }, { $set: { isActive: true } });
  return matchedCount === 1;
}

// Derruba todos os JWTs já emitidos do usuário (logout). $inc no banco, e não
// ler-somar-salvar, para dois logouts simultâneos não se sobrescreverem.
async function incrementTokenVersion(id) {
  await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
}

async function remove(id) {
  const { deletedCount } = await User.deleteOne({ _id: id });
  return deletedCount === 1;
}

function countAdmins() {
  return User.countDocuments({ role: 'admin' });
}

// RN-09: o sistema sempre mantém ao menos 1 admin ativo. excludeId conta os
// que sobrariam se aquele usuário saísse (exclusão ou rebaixamento).
function countActiveAdmins({ excludeId } = {}) {
  const filter = { role: 'admin', isActive: true };
  if (excludeId) filter._id = { $ne: excludeId };
  return User.countDocuments(filter);
}

// Resumo para a área administrativa (API da US-08 e painel da US-19).
async function stats() {
  const [totalUsers, admins, inactive] = await Promise.all([
    User.countDocuments(),
    countAdmins(),
    User.countDocuments({ isActive: false }),
  ]);
  return { totalUsers, admins, inactive };
}

module.exports = {
  findByUsernameOrEmail,
  findByEmail,
  findById,
  create,
  list,
  update,
  activate,
  incrementTokenVersion,
  delete: remove,
  countAdmins,
  countActiveAdmins,
  stats,
};
