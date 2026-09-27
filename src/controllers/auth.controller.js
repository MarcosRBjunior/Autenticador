const authService = require('../services/AuthService');

async function register(req, res) {
  const user = await authService.register(req.body);
  // O toJSON do model tira password e tokenVersion.
  res.status(201).json({ user });
}

module.exports = { register };
