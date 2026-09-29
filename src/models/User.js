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
  // Senha nova (RN-11) ou role nova (o token carrega a role) derrubam os JWTs
  // emitidos antes. Fica aqui, e não em cada rota, para nenhum caminho que
  // mude uma das duas esquecer disso. Role igual à atual não conta como mudança.
  // $inc no banco, e não somar aqui e gravar: um logout que chegue enquanto o
  // bcrypt calcula o hash não se perde (senão um JWT emitido nessa janela
  // sobreviveria à troca).
  if (!this.isNew && (this.isModified('password') || this.isModified('role'))) {
    this.$inc('tokenVersion', 1);
  }
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  }
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
