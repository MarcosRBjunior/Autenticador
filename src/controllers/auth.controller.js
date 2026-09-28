const authService = require('../services/AuthService');

// Secure sempre: navegadores aceitam cookie Secure em http://localhost, e em
// produção o app só roda em HTTPS.
const ACCESS_TOKEN_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

async function register(req, res) {
  const user = await authService.register(req.body);
  // O toJSON do model tira password e tokenVersion.
  res.status(201).json({ user });
}

async function login(req, res) {
  const { token, expiresIn, user } = await authService.login(req.body);
  res.cookie('access_token', token, { ...ACCESS_TOKEN_COOKIE, maxAge: expiresIn * 1000 });
  res.status(200).json({ token, expiresIn, user });
}

// req.user vem do identifyUser: existe só se o token ainda era válido. O cookie
// sai sempre, com os mesmos atributos do login (senão o navegador não o apaga).
async function endSession(req, res) {
  await authService.logout(req.user);
  res.clearCookie('access_token', ACCESS_TOKEN_COOKIE);
}

async function logout(req, res) {
  await endSession(req, res);
  res.status(204).end();
}

async function logoutPage(req, res) {
  await endSession(req, res);
  res.redirect('/login');
}

module.exports = { register, login, logout, logoutPage };
