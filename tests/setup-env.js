// Valores fixos para a suíte não depender do .env local (o CI roda sem ele)
// nem apontar por acidente para um banco real.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/auth-system-test';
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-chars';
// Simula a Vercel (1 proxy na frente): os testes usam X-Forwarded-For para
// dar um IP diferente a cada cenário de rate limit.
process.env.TRUST_PROXY = '1';
