const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: false },
    // Incrementado para invalidar todos os JWTs já emitidos do usuário.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// strength 2 ignora maiúsculas/minúsculas: "Ana" e "ana" colidem. Buscas por
// username precisam usar a mesma collation para aproveitar este índice.
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ email: 1 }, { unique: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  // RN-11: senha nova derruba os JWTs emitidos com a antiga. Fica aqui, e não
  // em cada rota, para nenhum caminho que troque a senha esquecer disso.
  if (!this.isNew) this.tokenVersion += 1;
});

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
