const path = require('node:path');
const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');

// Documentação interativa da API (Swagger UI) a partir do docs/openapi.yaml.
// Só fora de produção (o app.js decide); o YAML é lido pelo próprio navegador.
const SPEC_FILE = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');

const router = Router();

router.get('/openapi.yaml', (req, res) => {
  res.type('yaml').sendFile(SPEC_FILE);
});

router.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'Auth System API',
    swaggerOptions: { url: '/api-docs/openapi.yaml' },
  }),
);

module.exports = router;
