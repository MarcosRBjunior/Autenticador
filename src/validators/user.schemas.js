const { z } = require('zod');
const { registerSchema } = require('./auth.schemas');

// A query chega como texto: page e limit são convertidos para número. Um
// parâmetro repetido chega como lista e é recusado.
const listUsersQuery = z.object({
  page: z.coerce
    .number({ error: 'page deve ser um número' })
    .int('page deve ser um número inteiro')
    .min(1, 'page começa em 1')
    .default(1),
  limit: z.coerce
    .number({ error: 'limit deve ser um número' })
    .int('limit deve ser um número inteiro')
    .min(1, 'limit mínimo é 1')
    .max(100, 'limit máximo é 100')
    .default(20),
  search: z
    .string({ error: 'search deve aparecer uma vez só' })
    .trim()
    .max(50, 'Busca longa demais')
    .optional(),
});

// Exige os 24 caracteres hexadecimais de um ObjectId. O mongoose.isValidObjectId
// aceitaria qualquer texto de 12 caracteres.
const userIdParams = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Id inválido'),
});

// Mesmas regras de formato do registro (inclui o limite de 72 bytes do bcrypt).
const { username, password } = registerSchema.shape;
const NOTHING_TO_UPDATE = 'Informe o novo username ou a nova senha';

// Lista do que o admin pode editar aqui (RN-08: role tem rota própria). O
// z.object descarta o resto, então um body só com "role" chega vazio e é
// recusado, em vez de responder 200 sem ter mudado nada.
const updateUserSchema = z
  .object({ username: username.optional(), password: password.optional() })
  .superRefine((data, ctx) => {
    if (data.username !== undefined || data.password !== undefined) return;
    for (const field of ['username', 'password']) {
      ctx.addIssue({ code: 'custom', path: [field], message: NOTHING_TO_UPDATE });
    }
  });

// D-07: a role só muda por esta rota dedicada; o resto do body é descartado.
const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin'], { error: 'A role deve ser "user" ou "admin"' }),
});

module.exports = { listUsersQuery, userIdParams, updateUserSchema, updateRoleSchema };
