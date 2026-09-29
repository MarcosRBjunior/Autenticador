const { z } = require('zod');
const authService = require('../../services/AuthService');
const background = require('../../utils/background');
const { activateSchema, resendActivationSchema } = require('../../validators/auth.schemas');

const text = (value) => (typeof value === 'string' ? value : '');

const SENT =
  'Se houver uma conta aguardando ativação com esse e-mail, você vai receber um novo link.';

function showActivate(req, res) {
  const token = text(req.query.token);
  if (!token) return res.status(400).render('activate', { invalidLink: true });
  return res.render('activate', { token });
}

async function activate(req, res) {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).render('activate', { invalidLink: true });

  try {
    await authService.activateAccount(parsed.data);
  } catch (err) {
    if (err.code === 'TOKEN_INVALID_OR_EXPIRED') {
      return res.status(400).render('activate', { invalidLink: true });
    }
    throw err;
  }
  return res.redirect(303, '/login?activated=1');
}

function showResend(req, res) {
  res.render('resend-activation', { values: {}, notice: req.query.sent === '1' ? SENT : null });
}

function resend(req, res) {
  const parsed = resendActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).render('resend-activation', {
      values: { email: text(req.body.email) },
      errors: z.flattenError(parsed.error).fieldErrors,
    });
  }
  const { email } = parsed.data;
  background.run('activation_resend', () => authService.resendActivationLink(email));
  return res.redirect(303, '/resend-activation?sent=1');
}

module.exports = { showActivate, activate, showResend, resend };
