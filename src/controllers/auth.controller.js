const authService = require('../services/AuthService');
const background = require('../utils/background');
const { setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

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
  setSessionCookie(res, { token, expiresIn });
  res.status(200).json({ token, expiresIn, user });
}

// req.user vem do identifyUser: existe só se o token ainda era válido. O cookie
// sai sempre.
async function endSession(req, res) {
  await authService.logout(req.user);
  clearSessionCookie(res);
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

const RESEND_ACTIVATION_MESSAGE =
  'Se houver uma conta aguardando ativação com esse e-mail, você vai receber um novo link.';

// Mesmo desenho do forgot: responde antes de procurar a conta.
function resendActivation(req, res) {
  const { email } = req.body;
  background.run('activation_resend', () => authService.resendActivationLink(email));
  res.status(200).json({ message: RESEND_ACTIVATION_MESSAGE });
}

async function activate(req, res) {
  await authService.activateAccount(req.body);
  res.status(200).json({ message: 'Conta ativada. Agora você já pode entrar.' });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.status(200).json({ message: 'Senha redefinida. Entre com a nova senha.' });
}

module.exports = {
  register,
  login,
  logout,
  logoutPage,
  forgotPassword,
  resetPassword,
  activate,
  resendActivation,
};
