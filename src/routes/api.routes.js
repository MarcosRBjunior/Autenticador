const { Router } = require('express');
const healthController = require('../controllers/health.controller');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validate');
const { registerLimiter } = require('../middlewares/rateLimiters');
const { registerSchema } = require('../validators/auth.schemas');

const router = Router();

router.get('/health', healthController.check);

// Pública: entra na allowlist quando o guard de autenticação chegar (US-07).
router.post('/register', registerLimiter, validate(registerSchema), authController.register);

module.exports = router;
