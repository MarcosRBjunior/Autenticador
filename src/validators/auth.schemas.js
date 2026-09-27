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

module.exports = { registerSchema };
