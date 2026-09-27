const mongoose = require('mongoose');

// Tokens de uso único enviados por e-mail (ativação de conta e reset de senha).
// Só o hash SHA-256 fica no banco; o token puro existe apenas no link.
const authTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['activation', 'password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// O Mongo apaga o documento quando expiresAt passa (a varredura roda a cada
// ~60 s, então as consultas ainda precisam filtrar por expiresAt > agora).
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthToken', authTokenSchema);
