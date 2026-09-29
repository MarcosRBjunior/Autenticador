const userService = require('../../services/UserService');
const { listUsersQuery } = require('../../validators/user.schemas');

const PAGE_SIZE = 20;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

// Um cartão por usuário. D-08: o usuário comum vê username e data; o admin vê
// também e-mail, perfil e status (o service já traz só os campos permitidos).
function toCard(user, isAdmin) {
  const card = {
    username: user.username,
    initial: user.username.charAt(0).toUpperCase(),
    since: dateFormat.format(user.createdAt),
  };
  if (isAdmin) Object.assign(card, { email: user.email, role: user.role, isActive: user.isActive });
  return card;
}

async function list(req, res) {
  const parsed = listUsersQuery.safeParse(req.query);
  const { page, search } = parsed.success ? parsed.data : { page: 1, search: undefined };
  const result = await userService.listUsers(req.user, { page, limit: PAGE_SIZE, search });
  const isAdmin = req.user.role === 'admin';

  const href = (number) =>
    `/users?${new URLSearchParams({ ...(search && { search }), page: String(number) })}`;

  res.render('users', {
    viewer: { username: req.user.username, isAdmin },
    users: result.data.map((user) => toCard(user, isAdmin)),
    total: result.total,
    search: search ?? '',
    pages: Array.from({ length: result.totalPages }, (_, i) => ({
      number: i + 1,
      href: href(i + 1),
      current: i + 1 === page,
    })),
  });
}

module.exports = { list };
