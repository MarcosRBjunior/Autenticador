const User = require('../../src/models/User');
const tokenService = require('../../src/services/TokenService');

let counter = 0;

// insertMany pula o hook de hash do model: é rápido e serve para usuários que
// entram nos testes com token assinado direto, sem logar com senha.
async function createUser(overrides = {}) {
  counter += 1;
  const [user] = await User.insertMany([
    {
      username: `usuario${counter}`,
      email: `usuario${counter}@example.com`,
      password: 'nao-usada-nos-testes',
      isActive: true,
      ...overrides,
    },
  ]);
  return user;
}

const tokenFor = (user) =>
  tokenService.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });

async function createUserWithToken(overrides) {
  const user = await createUser(overrides);
  return { user, token: tokenFor(user) };
}

module.exports = { createUser, tokenFor, createUserWithToken };
