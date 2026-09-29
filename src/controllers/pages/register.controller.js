const { z } = require('zod');
const authService = require('../../services/AuthService');
const background = require('../../utils/background');
const { registerFormSchema } = require('../../validators/auth.schemas');

const text = (value) => (typeof value === 'string' ? value : '');

const renderRegister = (res, status, data = {}) =>
  res.status(status).render('register', { values: {}, ...data });

function showRegister(req, res) {
  renderRegister(res, 200);
}

async function register(req, res) {
  const values = { username: text(req.body.username), email: text(req.body.email) };
  const parsed = registerFormSchema.safeParse(req.body);
  if (!parsed.success) {
    return renderRegister(res, 400, { values, errors: z.flattenError(parsed.error).fieldErrors });
  }

  const { username, email, password } = parsed.data;
  let user;
  try {
    user = await authService.register({ username, email, password });
  } catch (err) {
    // 409: details já vem por campo (username ou email).
    if (err.status === 409) return renderRegister(res, 409, { values, errors: err.details });
    throw err;
  }
  // Como na API: o link sai depois da resposta; falha no envio vai para o log.
  background.run('activation_email', () => authService.sendActivationLink(user));
  return res.redirect(303, '/login?registered=1');
}

module.exports = { showRegister, register };
