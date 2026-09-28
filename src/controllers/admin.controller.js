const userService = require('../services/UserService');

async function summary(req, res) {
  res.json(await userService.getStats());
}

module.exports = { summary };
