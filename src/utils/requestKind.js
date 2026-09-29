// Rotas da API respondem JSON; o resto é página do navegador.
const isApiRequest = (req) => req.originalUrl.startsWith('/api/');

module.exports = { isApiRequest };
