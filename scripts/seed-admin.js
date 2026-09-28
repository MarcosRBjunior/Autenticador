// Cria o primeiro admin a partir de ADMIN_USERNAME, ADMIN_EMAIL e
// ADMIN_PASSWORD. Uso: npm run seed:admin (lê também o .env).
const mongoose = require('mongoose');
const { z } = require('zod');
const { connectDB } = require('../src/config/db');
const userRepository = require('../src/repositories/UserRepository');
const { registerSchema } = require('../src/validators/auth.schemas');

// Mesmas regras de formato do registro (inclui o limite de 72 bytes do bcrypt).
const { username, email, password } = registerSchema.shape;

const strongPassword = password
  .refine((value) => value.length >= 12, 'Em produção, use pelo menos 12 caracteres')
  .refine((value) => /[a-z]/.test(value), 'Inclua ao menos uma letra minúscula')
  .refine((value) => /[A-Z]/.test(value), 'Inclua ao menos uma letra maiúscula')
  .refine((value) => /\d/.test(value), 'Inclua ao menos um número')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Inclua ao menos um símbolo');

// Os erros saem com o nome da variável (ADMIN_PASSWORD...) e nunca com o valor.
function parseAdminConfig(env) {
  const schema = z.object({
    ADMIN_USERNAME: username,
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD: env.NODE_ENV === 'production' ? strongPassword : password,
  });
  const parsed = schema.parse(env);
  return {
    username: parsed.ADMIN_USERNAME,
    email: parsed.ADMIN_EMAIL,
    password: parsed.ADMIN_PASSWORD,
  };
}

// Idempotente: se o admin já existe, não cria outro nem altera o existente.
async function seedAdmin(config) {
  const existing = await userRepository.findByUsernameOrEmail(config.username, config.email);
  if (existing) {
    if (existing.role === 'admin') return { created: false, user: existing };
    // Promover essa conta daria acesso de admin a quem se registrou com o
    // username ou e-mail reservado para o admin.
    throw new Error(
      `já existe um usuário comum com esse username ou e-mail ("${existing.username}"). ` +
        'Ele não será promovido; defina outro ADMIN_USERNAME ou ADMIN_EMAIL.',
    );
  }

  // create() passa pelo hook do model, que aplica o bcrypt na senha.
  const user = await userRepository.create({ ...config, role: 'admin', isActive: true });
  return { created: true, user };
}

async function main() {
  // Valida antes de conectar: com configuração errada, o banco nem é tocado.
  const config = parseAdminConfig(process.env);
  await connectDB();
  const { created, user } = await seedAdmin(config);
  console.log(
    created
      ? `Admin "${user.username}" criado.`
      : `Admin "${user.username}" já existe; nada foi alterado.`,
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      if (err instanceof z.ZodError) {
        console.error('Variáveis de ambiente inválidas:', z.flattenError(err).fieldErrors);
      } else {
        console.error(`Falha ao criar o admin: ${err.message}`);
      }
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { parseAdminConfig, seedAdmin };
