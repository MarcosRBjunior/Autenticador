require('dotenv').config({ quiet: true });

const { z } = require('zod');

// No .env, `SMTP_HOST=` sem valor significa "não configurado".
const optional = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema);

// Sem elas em produção, o cadastro criaria contas que nunca recebem o link de
// ativação. Fora de produção o e-mail vai para o Ethereal.
const REQUIRED_IN_PRODUCTION = ['APP_URL', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Origens separadas por vírgula que podem chamar a API com cookies.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  // Quantos proxies ficam na frente do app (a Vercel usa 1). Com 0, o
  // X-Forwarded-For é ignorado e o cliente não consegue forjar o próprio IP.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MONGODB_URI: z.string({ error: 'obrigatória' }).min(1, 'obrigatória'),
  JWT_SECRET: z
    .string({ error: 'obrigatória' })
    .min(32, 'obrigatória, com pelo menos 32 caracteres'),
  // Endereço público do app, base dos links enviados por e-mail. Sem query nem
  // fragmento: `${APP_URL}/caminho` cairia dentro deles.
  APP_URL: optional(
    z
      .url({ protocol: /^https?$/, error: 'precisa ser uma URL http(s)' })
      .refine((url) => !/[?#]/.test(url), 'não pode ter query (?) nem fragmento (#)')
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
  ),
  MAIL_FROM: optional(z.string().optional()),
  SMTP_HOST: optional(z.string().optional()),
  SMTP_PORT: optional(z.coerce.number().int().positive().default(587)),
  SMTP_USER: optional(z.string().optional()),
  SMTP_PASS: optional(z.string().optional()),
});

const schema = envSchema
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (!env[name]) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'obrigatória em produção' });
      }
    }
    // O token viaja no link: em http, qualquer um na mesma rede o lê.
    if (env.APP_URL && new URL(env.APP_URL).protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'precisa ser https em produção' });
    }
  })
  .transform((env) => ({
    ...env,
    APP_URL: env.APP_URL ?? `http://localhost:${env.PORT}`,
    MAIL_FROM: env.MAIL_FROM ?? 'Auth System <no-reply@example.com>',
  }));

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

module.exports = Object.freeze(parsed.data);
