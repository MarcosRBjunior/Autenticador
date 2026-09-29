const express = require('express');
const authController = require('../controllers/auth.controller');
const registration = require('../controllers/pages/register.controller');
const session = require('../controllers/pages/session.controller');
const activation = require('../controllers/pages/activation.controller');
const recovery = require('../controllers/pages/recovery.controller');
const usersPage = require('../controllers/pages/users.controller');
const adminPages = require('../controllers/pages/admin.controller');
const { identifyUser, isAdmin } = require('../middlewares/auth');
const { issueCsrf, verifyCsrf } = require('../middlewares/csrf');
const {
  loginLimiter,
  registerLimiter,
  activateLimiter,
  resendActivationLimiters,
  forgotPasswordLimiters,
  resetPasswordLimiter,
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

router.get('/forgot-password', issueCsrf, recovery.showForgot);
router.post('/forgot-password', form, verifyCsrf, forgotPasswordLimiters, recovery.forgot);
router.get('/reset-password', issueCsrf, recovery.showReset);
router.post('/reset-password', form, verifyCsrf, resetPasswordLimiter, recovery.reset);

// Sai para o /login mesmo com o token já inválido.
router.get('/logout', identifyUser, authController.logoutPage);
// O botão "Sair" da barra: POST com CSRF, para outro site não deslogar ninguém.
router.post('/logout', form, verifyCsrf, identifyUser, authController.logoutPage);

// Logada: o guard garante req.user e manda para o /login sem sessão.
router.get('/users', issueCsrf, usersPage.list);

// Só admin: o guard garantiu a sessão e o isAdmin vem antes de ler formulário
// ou CSRF (quem não é admin recebe 403 direto). Sem rate limit: só um admin
// logado chega aqui.
router.get('/admin', isAdmin, issueCsrf, adminPages.dashboard);
router.post('/admin/users/:id/role', isAdmin, form, verifyCsrf, adminPages.changeRole);
router.get('/admin/users/:id/edit', isAdmin, issueCsrf, adminPages.showEdit);
router.post('/admin/users/:id', isAdmin, form, verifyCsrf, adminPages.update);
router.get('/admin/users/:id/delete', isAdmin, issueCsrf, adminPages.showDelete);
router.post('/admin/users/:id/delete', isAdmin, form, verifyCsrf, adminPages.remove);

module.exports = router;
