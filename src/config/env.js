require('dotenv').config({ quiet: true });

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string({ error: 'obrigatória' }).min(1, 'obrigatória'),
  JWT_SECRET: z
    .string({ error: 'obrigatória' })
    .min(32, 'obrigatória, com pelo menos 32 caracteres'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

module.exports = Object.freeze(parsed.data);
