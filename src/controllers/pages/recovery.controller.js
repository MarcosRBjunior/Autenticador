const { z } = require('zod');
const authService = require('../../services/AuthService');
const background = require('../../utils/background');
const { forgotPasswordSchema, resetPasswordFormSchema } = require('../../validators/auth.schemas');

const text = (value) => (typeof value === 'string' ? value : '');

const SENT = 'Se o e-mail estiver cadastrado, você vai receber um link para redefinir a senha.';

function showForgot(req, res) {
  res.render('forgot-password', { values: {}, notice: req.query.sent === '1' ? SENT : null });
}

function forgot(req, res) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('forgot-password', {
      values: { email: text(req.body.email) },
      errors: z.flattenError(parsed.error).fieldErrors,
    });
  }
  const { email } = parsed.data;
  background.run('password_reset_request', () => authService.requestPasswordReset(email));
  return res.redirect(303, '/forgot-password?sent=1');
}

function showReset(req, res) {
  const token = text(req.query.token);
  if (!token) return res.status(400).render('reset-password', { invalidLink: true });
  return res.render('reset-password', { token });
}

async function reset(req, res) {
  const parsed = resetPasswordFormSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    if (errors.token) return res.status(400).render('reset-password', { invalidLink: true });
    // O link continua valendo: a pessoa corrige a senha e envia de novo.
    return res.status(400).render('reset-password', { token: text(req.body.token), errors });
  }

  const { token, newPassword } = parsed.data;
  try {
    await authService.resetPassword({ token, newPassword });
  } catch (err) {
    if (err.code === 'TOKEN_INVALID_OR_EXPIRED') {
      return res.status(400).render('reset-password', { invalidLink: true });
    }
    throw err;
  }
  return res.redirect(303, '/login?reset=1');
}

module.exports = { showForgot, forgot, showReset, reset };
