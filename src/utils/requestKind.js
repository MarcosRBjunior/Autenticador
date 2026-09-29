// Rotas da API respondem JSON; o resto é página do navegador.
const isApiRequest = (req) => /^\/api(\/|$|\?)/i.test(req.originalUrl);

module.exports = { isApiRequest };
