const express = require('express');
const authController = require('../controllers/auth.controller');
const registration = require('../controllers/pages/register.controller');
const session = require('../controllers/pages/session.controller');
const activation = require('../controllers/pages/activation.controller');
const { identifyUser } = require('../middlewares/auth');
const { issueCsrf, verifyCsrf } = require('../middlewares/csrf');
const {
  loginLimiter,
  registerLimiter,
  activateLimiter,
  resendActivationLimiters,
} = require('../middlewares/rateLimiters');

// Páginas do navegador, fora de /api/v1 (views EJS, US-18).
const router = express.Router();

// Só as páginas leem formulário HTML; a API segue aceitando só JSON (é o que
// impede outro site de postar nela com um <form>).
const form = express.urlencoded({ extended: false, limit: '10kb' });

// Públicas na allowlist. Os POST passam pelo CSRF e pelos mesmos rate limits
// da API (mesma instância, mesmo contador).
router.get('/', identifyUser, session.home);
router.get('/login', identifyUser, issueCsrf, session.showLogin);
router.post('/login', form, verifyCsrf, loginLimiter, session.login);
router.get('/register', issueCsrf, registration.showRegister);
router.post('/register', form, verifyCsrf, registerLimiter, registration.register);

// Só o POST ativa: scanners de link dos provedores de e-mail abrem o GET sozinhos.
router.get('/activate', issueCsrf, activation.showActivate);
router.post('/activate', form, verifyCsrf, activateLimiter, activation.activate);
router.get('/resend-activation', issueCsrf, activation.showResend);
router.post('/resend-activation', form, verifyCsrf, resendActivationLimiters, activation.resend);

// Sai para o /login mesmo com o token já inválido.
router.get('/logout', identifyUser, authController.logoutPage);

module.exports = router;
