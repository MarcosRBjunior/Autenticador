const authService = require('../../services/AuthService');
const { loginSchema } = require('../../validators/auth.schemas');
const { setSessionCookie } = require('../../utils/sessionCookie');

// Avisos depois de um redirect: só parâmetros conhecidos, nunca texto da URL.
const NOTICES = {
  registered: 'Conta criada. Enviamos um link de ativação para o seu e-mail.',
  activated: 'Conta ativada. Entre com seu usuário e senha.',
  reset: 'Senha redefinida. Entre com a nova senha.',
};

const text = (value) => (typeof value === 'string' ? value : '');

const renderLogin = (res, status, data = {}) =>
  res.status(status).render('login', { values: {}, ...data });

function home(req, res) {
  res.redirect(req.user ? '/users' : '/login');
}

function showLogin(req, res) {
  if (req.user) return res.redirect('/users');
  const flag = Object.keys(NOTICES).find((key) => req.query[key] === '1');
  return renderLogin(res, 200, { notice: NOTICES[flag] });
}

async function login(req, res) {
  const values = { username: text(req.body.username) };
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return renderLogin(res, 400, { values, error: 'Informe o usuário ou e-mail e a senha.' });
  }

  try {
    setSessionCookie(res, await authService.login(parsed.data));
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return renderLogin(res, 401, { values, error: 'Usuário ou senha inválidos.' });
    }
    if (err.code === 'ACCOUNT_INACTIVE') return renderLogin(res, 403, { values, inactive: true });
    throw err;
  }
  return res.redirect(303, '/users');
}

module.exports = { home, showLogin, login };
