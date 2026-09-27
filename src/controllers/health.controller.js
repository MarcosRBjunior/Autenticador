const { isDatabaseUp } = require('../config/db');

async function check(req, res) {
  if (await isDatabaseUp()) {
    return res.status(200).json({ status: 'ok', db: 'up' });
  }
  return res.status(503).json({ status: 'error', db: 'down' });
}

module.exports = { check };
