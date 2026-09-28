const userService = require('../services/UserService');

// req.user vem do guard de autenticação; a projeção depende do perfil dele.
async function list(req, res) {
  res.json(await userService.listUsers(req.user, req.validated.query));
}

async function getById(req, res) {
  const user = await userService.getUser(req.user, req.validated.params.id);
  res.json({ user });
}

module.exports = { list, getById };
