const { Router } = require('express');
const healthController = require('../controllers/health.controller');
const authController = require('../controllers/auth.controller');
const usersController = require('../controllers/users.controller');
const adminController = require('../controllers/admin.controller');
const { isAdmin, identifyUser } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const {
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiters,
  resendActivationLimiters,
  resetPasswordLimiter,
  activateLimiter,
} = require('../middlewares/rateLimiters');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  activateSchema,
  resendActivationSchema,
} = require('../validators/auth.schemas');
const {
  listUsersQuery,
  userIdParams,
  updateUserSchema,
  updateRoleSchema,
} = require('../validators/user.schemas');

const router = Router();

router.get('/health', healthController.check);

// Públicas: liberadas na allowlist de middlewares/authGuard.js.
router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/logout', identifyUser, authController.logout);
router.post(
  '/auth/forgot-password',
  forgotPasswordLimiters,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/auth/reset-password',
  resetPasswordLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
// Só POST ativa: scanners de link dos provedores de e-mail abrem o GET sozinhos.
router.post('/auth/activate', activateLimiter, validate(activateSchema), authController.activate);
router.post(
  '/auth/resend-activation',
  resendActivationLimiters,
  validate(resendActivationSchema),
  authController.resendActivation,
);

// Protegidas pelo guard global: qualquer usuário autenticado.
router.get('/me', usersController.me);
router.get('/users', validate(listUsersQuery, 'query'), usersController.list);
router.get('/users/:id', validate(userIdParams, 'params'), usersController.getById);

// Só admin (o guard global já garantiu a autenticação). O isAdmin vem antes da
// validação: o usuário comum recebe 403 sem saber o que o body precisaria ter.
router.get('/admin', isAdmin, adminController.summary);
router.put(
  '/users/:id',
  isAdmin,
  validate(userIdParams, 'params'),
  validate(updateUserSchema),
  usersController.update,
);
router.patch(
  '/users/:id/role',
  isAdmin,
  validate(userIdParams, 'params'),
  validate(updateRoleSchema),
  usersController.updateRole,
);
router.delete('/users/:id', isAdmin, validate(userIdParams, 'params'), usersController.remove);

module.exports = router;
