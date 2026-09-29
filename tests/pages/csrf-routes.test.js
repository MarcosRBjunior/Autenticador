const db = require('../helpers/db');
const { browser, textOf } = require('../helpers/browser');
const app = require('../../src/app');

let lastIp = 0;
const newIp = () => `10.40.0.${++lastIp}`;

beforeAll(db.connect);
afterAll(db.close);

// Cada POST de página precisa do token: sem _csrf, 403 antes de qualquer lógica.
describe('CSRF em todos os POSTs de página', () => {
  it.each([
    ['/login', '/login'],
    ['/register', '/register'],
    ['/activate', '/activate?token=abc'],
    ['/resend-activation', '/activate'],
    ['/forgot-password', '/forgot-password'],
    ['/reset-password', '/reset-password?token=abc'],
    ['/logout', '/login'],
  ])('POST %s sem _csrf: 403', async (path, from) => {
    const page = browser(app, { ip: newIp() });
    await page.get(from);

    const res = await page.post(path, { token: 'abc' });

    expect(res.status).toBe(403);
    expect(textOf(res.text)).toContain('A página expirou');
  });
});
