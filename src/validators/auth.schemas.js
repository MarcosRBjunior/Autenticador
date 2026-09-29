const { z } = require('zod');

// O bcrypt ignora o que passa de 72 bytes, então o limite é em bytes: uma
// senha com acentos pode ter menos de 72 caracteres e mesmo assim estourar.
const MAX_PASSWORD_BYTES = 72;

const username = z
  .string({ error: 'Informe o username' })
  .trim()
  .min(3, 'O username deve ter pelo menos 3 caracteres')
  .max(30, 'O username deve ter no máximo 30 caracteres')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Use apenas letras sem acento, números, ponto, hífen e _');

const email = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail longo demais')
  .pipe(z.email('E-mail inválido'));

const password = z
  .string({ error: 'Informe a senha' })
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
    'A senha deve ter no máximo 72 bytes (cerca de 72 caracteres sem acento)',
  );

// z.object descarta chaves desconhecidas: um "role" no body some aqui.
const registerSchema = z.object({ username, email, password });

// O login não repete as regras de formato do registro: uma senha fora do
// padrão recebe o mesmo 401 de credenciais inválidas. Exigir texto já barra
// objetos como {"$gt": ""} antes de chegarem ao Mongo.
const loginSchema = z.object({
  // Aceita o username ou o e-mail no mesmo campo.
  username: z
    .string({ error: 'Informe o username ou e-mail' })
    .trim()
    .min(1, 'Informe o username ou e-mail')
    .max(254, 'Username ou e-mail longo demais'),
  password: z
    .string({ error: 'Informe a senha' })
    .min(1, 'Informe a senha')
    .max(1024, 'Senha longa demais'),
});

const forgotPasswordSchema = z.object({ email });

// O token só precisa ser texto (um objeto como {"$ne": null} para aqui); se
// ele vale ou não, quem diz é o banco. A senha nova segue as regras do cadastro.
const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Informe o token do link' })
    .trim()
    .min(1, 'Informe o token do link')
    .max(256, 'Token longo demais'),
  newPassword: password,
});

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema };
