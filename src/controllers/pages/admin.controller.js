const { z } = require('zod');
const userService = require('../../services/UserService');
const AppError = require('../../utils/AppError');
const {
  listUsersQuery,
  userIdParams,
  updateUserSchema,
  updateRoleSchema,
} = require('../../validators/user.schemas');

const PAGE_SIZE = 20;

// Avisos depois de uma ação: só códigos conhecidos, nunca texto da URL.
const NOTICES = {
  updated: 'Usuário atualizado.',
  role: 'Perfil alterado.',
  deleted: 'Usuário excluído.',
};
const ERRORS = { 'last-admin': 'Não é possível remover o último admin.' };

// hasOwn: uma chave como "__proto__" não pode trazer um valor herdado.
const pick = (map, key) =>
  typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;

const notFound = () => new AppError(404, 'NOT_FOUND', 'Usuário não encontrado');

// Busca e página da lista: vêm da query nos GET e de campos ocultos nos POST,
// para cada ação voltar à mesma posição.
function listState(source) {
  const parsed = listUsersQuery.safeParse({
    page: source.page,
    search: source.search || undefined,
  });
  return parsed.success
    ? { page: parsed.data.page, search: parsed.data.search ?? '' }
    : { page: 1, search: '' };
}

function withState(path, { page, search }, extra = {}) {
  const query = new URLSearchParams({
    ...(search && { search }),
    ...(page > 1 && { page: String(page) }),
    ...extra,
  }).toString();
  return query ? `${path}?${query}` : path;
}

function userId(req) {
  const parsed = userIdParams.safeParse(req.params);
  if (!parsed.success) throw notFound();
  return parsed.data.id;
}

async function dashboard(req, res) {
  const state = listState(req.query);
  const [stats, result] = await Promise.all([
    userService.getStats(),
    userService.listUsers(req.user, {
      page: state.page,
      limit: PAGE_SIZE,
      search: state.search || undefined,
    }),
  ]);

  const users = result.data.map((user) => {
    const id = String(user._id);
    return {
      id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isSelf: id === req.user.id,
      editHref: withState(`/admin/users/${id}/edit`, state),
      deleteHref: withState(`/admin/users/${id}/delete`, state),
    };
  });

  res.render('admin', {
    viewer: { username: req.user.username, isAdmin: true },
    stats,
    users,
    state,
    notice: pick(NOTICES, req.query.done),
    error: pick(ERRORS, req.query.error),
    pages: Array.from({ length: result.totalPages }, (_, i) => ({
      number: i + 1,
      href: withState('/admin', { ...state, page: i + 1 }),
      current: i + 1 === state.page,
    })),
  });
}

async function changeRole(req, res) {
  const id = userId(req);
  const state = listState(req.body);
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Perfil inválido');

  try {
    await userService.changeRole(req.user, id, parsed.data.role);
  } catch (err) {
    if (err.code === 'LAST_ADMIN') {
      return res.redirect(303, withState('/admin', state, { error: 'last-admin' }));
    }
    throw err;
  }
  return res.redirect(303, withState('/admin', state, { done: 'role' }));
}

const text = (value) => (typeof value === 'string' ? value : '');

function renderEdit(res, status, { id, user, state, values = {}, errors }) {
  res.status(status).render('admin-edit', {
    user: { id, username: user.username },
    values,
    errors,
    state,
    backHref: withState('/admin', state),
  });
}

async function showEdit(req, res) {
  const id = userId(req);
  const state = listState(req.query);
  const user = await userService.getUser(req.user, id);
  renderEdit(res, 200, { id, user, state, values: { username: user.username } });
}

// Senha em branco = manter a atual. Trocar a senha derruba as sessões da conta
// (o hook do model sobe o tokenVersion, RN-11).
async function update(req, res) {
  const id = userId(req);
  const state = listState(req.body);
  const user = await userService.getUser(req.user, id);
  const values = { username: text(req.body.username) };
  const password = text(req.body.password);

  const parsed = updateUserSchema.safeParse({
    username: values.username,
    ...(password && { password }),
  });
  if (!parsed.success) {
    return renderEdit(res, 400, {
      id,
      user,
      state,
      values,
      errors: z.flattenError(parsed.error).fieldErrors,
    });
  }

  try {
    await userService.updateUser(req.user, id, parsed.data);
  } catch (err) {
    // 409: details já vem por campo (username).
    if (err.status === 409) {
      return renderEdit(res, 409, { id, user, state, values, errors: err.details });
    }
    throw err;
  }
  return res.redirect(303, withState('/admin', state, { done: 'updated' }));
}

module.exports = { dashboard, changeRole, showEdit, update };
