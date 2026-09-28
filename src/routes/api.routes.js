const { Router } = require('express');
const healthController = require('../controllers/health.controller');
const authController = require('../controllers/auth.controller');
const usersController = require('../controllers/users.controller');
const adminController = require('../controllers/admin.controller');
const { isAdmin } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { registerLimiter, loginLimiter } = require('../middlewares/rateLimiters');
const { registerSchema, loginSchema } = require('../validators/auth.schemas');
const { listUsersQuery, userIdParams } = require('../validators/user.schemas');

const router = Router();

router.get('/health', healthController.check);

// Públicas: liberadas na allowlist de middlewares/authGuard.js.
router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

// Protegidas pelo guard global: qualquer usuário autenticado.
router.get('/users', validate(listUsersQuery, 'query'), usersController.list);
router.get('/users/:id', validate(userIdParams, 'params'), usersController.getById);

// Só admin (o guard global já garantiu a autenticação).
router.get('/admin', isAdmin, adminController.summary);

module.exports = router;
