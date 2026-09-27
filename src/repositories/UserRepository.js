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

function findById(id) {
  return User.findById(id);
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

async function remove(id) {
  const { deletedCount } = await User.deleteOne({ _id: id });
  return deletedCount === 1;
}

function countAdmins() {
  return User.countDocuments({ role: 'admin' });
}

module.exports = {
  findByUsernameOrEmail,
  findById,
  list,
  update,
  delete: remove,
  countAdmins,
};
