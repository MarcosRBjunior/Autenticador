const userService = require('../services/UserService');

// req.user vem do guard de autenticação; a projeção depende do perfil dele.
async function list(req, res) {
  res.json(await userService.listUsers(req.user, req.validated.query));
}

async function getById(req, res) {
  const user = await userService.getUser(req.user, req.validated.params.id);
  res.json({ user });
}

// Só admin chega aqui (isAdmin na rota); req.body já passou pela whitelist.
async function update(req, res) {
  const user = await userService.updateUser(req.user, req.validated.params.id, req.body);
  res.json({ user });
}

module.exports = { list, getById, update };
