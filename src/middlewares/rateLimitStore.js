const { createHash } = require('node:crypto');
const RateLimit = require('../models/RateLimit');

// D-15: as contagens do rate limit ficam no Mongo. Na Vercel cada instância da
// função tem a própria memória, e a contagem em memória valia por instância.
// Janela fixa: a primeira tentativa abre a janela e as seguintes somam até ela
// vencer. $$NOW é o relógio do banco, o mesmo para todas as instâncias.
const windowOpen = { $gt: ['$resetAt', '$$NOW'] };

class MongoRateLimitStore {
  // A contagem de uma instância vale para as outras.
  localKeys = false;

  // Cada limite precisa de um prefixo próprio: dois limites com a mesma chave
  // (o IP, por exemplo) não podem somar na mesma contagem.
  constructor(prefix) {
    this.prefix = `${prefix}:`;
  }

  init({ windowMs }) {
    this.windowMs = windowMs;
  }

  // A chave tem o IP e às vezes o e-mail: no banco fica só o hash.
  id(key) {
    return this.prefix + createHash('sha256').update(key).digest('hex');
  }

  // Uma operação só, atômica: instâncias contando a mesma chave ao mesmo tempo
  // não perdem tentativas. Janela vencida (o TTL ainda não apagou) recomeça em 1.
  async increment(key) {
    const doc = await RateLimit.findOneAndUpdate(
      { _id: this.id(key) },
      [
        {
          $set: {
            hits: { $cond: [windowOpen, { $add: ['$hits', 1] }, 1] },
            resetAt: { $cond: [windowOpen, '$resetAt', { $add: ['$$NOW', this.windowMs] }] },
          },
        },
      ],
      { upsert: true, returnDocument: 'after', lean: true, updatePipeline: true },
    );
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  // Desconta uma tentativa que não conta (o login que deu certo), só na janela
  // atual e sem passar de zero.
  async decrement(key) {
    await RateLimit.updateOne(
      { _id: this.id(key), hits: { $gt: 0 }, $expr: windowOpen },
      { $inc: { hits: -1 } },
    );
  }

  async resetKey(key) {
    await RateLimit.deleteOne({ _id: this.id(key) });
  }
}

module.exports = { MongoRateLimitStore };
