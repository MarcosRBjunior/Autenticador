const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { identifyUser } = require('../middlewares/auth');

// Páginas do navegador, fora de /api/v1 (views EJS, US-18).
const router = Router();

// Público na allowlist: logado vai para a lista, senão para o login.
router.get('/', identifyUser, (req, res) => res.redirect(req.user ? '/users' : '/login'));

// Público na allowlist: sai para o /login mesmo com o token já inválido.
router.get('/logout', identifyUser, authController.logoutPage);

module.exports = router;
