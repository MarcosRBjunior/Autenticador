const userService = require('../../services/UserService');
const AppError = require('../../utils/AppError');
const { listUsersQuery, userIdParams, updateRoleSchema } = require('../../validators/user.schemas');

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

module.exports = { dashboard, changeRole };
