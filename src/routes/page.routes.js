const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { identifyUser } = require('../middlewares/auth');

// Páginas do navegador, fora de /api/v1 (as telas EJS chegam na US-18; até lá
// o /login do redirect responde 404).
const router = Router();

// Público na allowlist: sai para o /login mesmo com o token já inválido.
router.get('/logout', identifyUser, authController.logoutPage);

module.exports = router;
