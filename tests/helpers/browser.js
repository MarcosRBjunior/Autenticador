const request = require('supertest');

function csrfFrom(html) {
  const match = /name="_csrf" value="([a-f0-9]{64})"/.exec(html);
  if (!match) throw new Error('A página não tem o campo _csrf');
  return match[1];
}

// Texto visível de uma página, para procurar mensagens.
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// Cliente que guarda os cookies como um navegador, inclusive os Secure: o
// agent do supertest não manda cookie Secure numa conexão http.
function browser(app, { ip } = {}) {
  const cookies = new Map();

  const keep = (res) => {
    for (const header of res.headers['set-cookie'] ?? []) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(header)) cookies.delete(name);
      else cookies.set(name, value);
    }
    return res;
  };

  const prepare = (req) => {
    if (cookies.size > 0) {
      req.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    if (ip) req.set('X-Forwarded-For', ip);
    return req;
  };

  const client = {
    cookies,
    get: async (path) => keep(await prepare(request(app).get(path))),
    post: async (path, form) =>
      keep(await prepare(request(app).post(path).type('form').send(form))),
    // Abre a página, pega o token CSRF do formulário e envia.
    async submit(path, form, { from = path } = {}) {
      const page = await client.get(from);
      return client.post(path, { ...form, _csrf: csrfFrom(page.text) });
    },
  };
  return client;
}

module.exports = { browser, csrfFrom, textOf };
