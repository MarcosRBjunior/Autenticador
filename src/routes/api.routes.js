const { Router } = require('express');
const healthController = require('../controllers/health.controller');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validate');
const { registerLimiter, loginLimiter } = require('../middlewares/rateLimiters');
const { registerSchema, loginSchema } = require('../validators/auth.schemas');

const router = Router();

router.get('/health', healthController.check);

// Públicas: entram na allowlist quando o guard de autenticação chegar (US-07).
router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

module.exports = router;
