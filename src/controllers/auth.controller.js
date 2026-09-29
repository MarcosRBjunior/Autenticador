const authService = require('../services/AuthService');
const background = require('../utils/background');

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
  // O link de ativação sai depois da resposta: o cadastro não espera o SMTP, e
  // uma falha no envio só vai para o log (a pessoa pode pedir o reenvio).
  background.run('activation_email', () => authService.sendActivationLink(user));
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

const FORGOT_PASSWORD_MESSAGE =
  'Se o e-mail estiver cadastrado, você vai receber um link para redefinir a senha.';

// Responde antes de procurar o usuário: a resposta e o tempo dela são os mesmos
// com ou sem conta, e ninguém espera o SMTP.
function forgotPassword(req, res) {
  // Só o e-mail vai para a tarefa, não a requisição inteira.
  const { email } = req.body;
  background.run('password_reset_request', () => authService.requestPasswordReset(email));
  res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.status(200).json({ message: 'Senha redefinida. Entre com a nova senha.' });
}

module.exports = { register, login, logout, logoutPage, forgotPassword, resetPassword };
