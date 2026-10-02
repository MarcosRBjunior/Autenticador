const mongoose = require('mongoose');

// Contagem de tentativas de um limite (cadastro, login...) para um cliente.
// Quem lê e grava é a store do rate limit (middlewares/rateLimitStore.js).
const rateLimitSchema = new mongoose.Schema(
  {
    // Nome do limite + hash da chave do cliente (IP, ou IP + conta).
    _id: { type: String },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { collection: 'rate_limits', versionKey: false },
);

// O Mongo apaga a contagem quando a janela vence (a varredura roda a cada
// ~60 s, então a store ainda confere resetAt).
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
