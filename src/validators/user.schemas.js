const { z } = require('zod');

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

module.exports = { listUsersQuery, userIdParams };
