const express = require('express');
const cookieParser = require('cookie-parser');
const { browser, csrfFrom } = require('./helpers/browser');
const { issueCsrf, verifyCsrf } = require('../src/middlewares/csrf');

// App mínimo: um formulário e um POST protegido.
function formApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/form', issueCsrf, (req, res) =>
    res.send(`<input name="_csrf" value="${res.locals.csrfToken}">`),
  );
  app.post('/form', express.urlencoded({ extended: false }), verifyCsrf, (req, res) =>
    res.send('ok'),
  );
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ code: err.code }));
  return app;
}

describe('CSRF', () => {
  it('a página grava o cookie csrf httpOnly, Secure e SameSite=Lax', async () => {
    const res = await browser(formApp()).get('/form');

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('csrf='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('aceita o POST com o token do formulário', async () => {
    const res = await browser(formApp()).submit('/form', {});

    expect(res.status).toBe(200);
  });

  it('o mesmo token vale para vários envios', async () => {
    const page = browser(formApp());
    const token = csrfFrom((await page.get('/form')).text);

    expect((await page.post('/form', { _csrf: token })).status).toBe(200);
    expect((await page.post('/form', { _csrf: token })).status).toBe(200);
  });

  it.each([
    ['sem token', () => ({})],
    ['com token errado', () => ({ _csrf: 'f'.repeat(64) })],
    ['com token multibyte', () => ({ _csrf: 'é'.repeat(64) })],
  ])('recusa o POST %s', async (_why, form) => {
    const page = browser(formApp());
    await page.get('/form');

    const res = await page.post('/form', form());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });

  // Outro site não lê o cookie da vítima: um token de outra sessão não serve.
  it('recusa o token de outro navegador', async () => {
    const other = csrfFrom((await browser(formApp()).get('/form')).text);
    const page = browser(formApp());
    await page.get('/form');

    expect((await page.post('/form', { _csrf: other })).status).toBe(403);
  });

  it('recusa o POST sem o cookie', async () => {
    const token = csrfFrom((await browser(formApp()).get('/form')).text);

    expect((await browser(formApp()).post('/form', { _csrf: token })).status).toBe(403);
  });

  it('troca um cookie adulterado por um novo', async () => {
    const page = browser(formApp());
    page.cookies.set('csrf', 'nao-hex');

    await page.get('/form');

    expect(page.cookies.get('csrf')).toMatch(/^[a-f0-9]{64}$/);
  });
});
