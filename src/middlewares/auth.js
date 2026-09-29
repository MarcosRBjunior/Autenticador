const mongoose = require('mongoose');
const userRepository = require('../repositories/UserRepository');
const tokenService = require('../services/TokenService');
const AppError = require('../utils/AppError');

const BEARER = /^Bearer\s+(\S+)$/i;

const unauthenticated = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Faça login para acessar este recurso');
const invalidToken = () => new AppError(401, 'INVALID_TOKEN', 'Token inválido ou expirado');

// O header Authorization tem prioridade; o cookie serve às telas do navegador.
function extractToken(req) {
  const header = req.get('authorization');
  if (header) return BEARER.exec(header)?.[1] ?? null;
  return req.cookies?.access_token ?? null;
}

// Devolve o dono do token da requisição ou lança 401 (AppError).
async function authenticate(req) {
  const token = extractToken(req);
  if (!token) throw unauthenticated();

  let payload;
  try {
    payload = tokenService.verify(token); // expirado, adulterado ou alg errado
  } catch {
    throw invalidToken();
  }

  const user = mongoose.isObjectIdOrHexString(payload.sub)
    ? await userRepository.findById(payload.sub)
    : null;

  // tv diferente do banco = token emitido antes de uma troca de senha, logout
  // ou mudança de perfil.
  if (!user || user.tokenVersion !== payload.tv) throw invalidToken();

  return user;
}

async function isAuthenticated(req, res, next) {
  req.user = await authenticate(req);
  next();
}

// Para o logout: preenche req.user quando o token é válido e segue sem usuário
// quando não é. Só os 401 de authenticate são engolidos; um erro de banco segue
// para o errorHandler.
async function identifyUser(req, res, next) {
  try {
    req.user = await authenticate(req);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
  }
  next();
}

// O perfil vem do usuário carregado do banco, nunca do que diz o token.
function isAdmin(req, res, next) {
  if (!req.user) throw unauthenticated();
  if (req.user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Acesso restrito a administradores');
  }
  next();
}

module.exports = { isAuthenticated, isAdmin, identifyUser, authenticate };
