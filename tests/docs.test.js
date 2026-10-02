const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const YAML = require('yaml');
const apiRoutes = require('../src/routes/api.routes');
const { isPublicRoute } = require('../src/middlewares/authGuard');
const app = require('../src/app');

const SPEC_FILE = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const spec = YAML.parse(fs.readFileSync(SPEC_FILE, 'utf8'));

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Cada operação do YAML: "GET /users/{id}" e o objeto dela.
const operations = Object.entries(spec.paths).flatMap(([route, item]) =>
  METHODS.filter((method) => item[method]).map((method) => ({
    method: method.toUpperCase(),
    route,
    operation: item[method],
  })),
);

// "/users/:id" (Express) → "/users/{id}" (OpenAPI)
const toOpenApiPath = (route) => route.replace(/:(\w+)/g, '{$1}');

const routerRoutes = () =>
  apiRoutes.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map(
        (method) => `${method.toUpperCase()} ${toOpenApiPath(layer.route.path)}`,
      ),
    );

function collectRefs(node, refs = []) {
  if (Array.isArray(node)) node.forEach((item) => collectRefs(item, refs));
  else if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string') refs.push(node.$ref);
    Object.values(node).forEach((value) => collectRefs(value, refs));
  }
  return refs;
}

const resolve = (ref) =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, key) => node?.[key], spec);

describe('docs/openapi.yaml', () => {
  it('é OpenAPI 3.1, com o próprio servidor primeiro e as URLs local e de produção', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers.map((server) => server.url)).toEqual([
      '/api/v1',
      'http://localhost:3000/api/v1',
      'https://autenticador-five.vercel.app/api/v1',
    ]);
  });

  it('documenta exatamente as rotas do router da API, nem mais nem menos', () => {
    const documented = operations.map(({ method, route }) => `${method} ${route}`);

    expect(documented.sort()).toEqual(routerRoutes().sort());
  });

  it('todo $ref aponta para um componente que existe', () => {
    const missing = collectRefs(spec).filter((ref) => resolve(ref) === undefined);

    expect(missing).toEqual([]);
  });

  it('pede token só nas rotas que o guard protege', () => {
    const mismatches = operations.filter(({ method, route, operation }) => {
      const concrete = `/api/v1${route.replace(/\{\w+\}/g, '0'.repeat(24))}`;
      const isPublic = isPublicRoute({ method, path: concrete });
      // A da operação substitui a global; um requisito vazio ({}) torna o token opcional.
      const security = operation.security ?? spec.security;
      const tokenRequired =
        security.length > 0 &&
        !security.some((requirement) => Object.keys(requirement).length === 0);
      return isPublic === tokenRequired;
    });

    expect(mismatches.map(({ method, route }) => `${method} ${route}`)).toEqual([]);
  });

  it('toda operação tem operationId único e resposta de sucesso', () => {
    const ids = operations.map(({ operation }) => operation.operationId);

    expect(new Set(ids).size).toBe(operations.length);
    for (const { operation } of operations) {
      expect(Object.keys(operation.responses).some((status) => /^2\d\d$/.test(status))).toBe(true);
    }
  });
});

describe('Swagger UI em /api-docs', () => {
  it('abre sem login fora de produção', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('carrega o docs/openapi.yaml', async () => {
    const init = await request(app).get('/api-docs/swagger-ui-init.js');
    const yaml = await request(app).get('/api-docs/openapi.yaml');

    expect(init.text).toContain('/api-docs/openapi.yaml');
    expect(yaml.status).toBe(200);
    expect(yaml.text).toBe(fs.readFileSync(SPEC_FILE, 'utf8'));
  });

  it('não existe em produção: cai no guard como qualquer página', async () => {
    let productionApp;
    jest.isolateModules(() => {
      jest.doMock('../src/config/env', () => ({
        ...jest.requireActual('../src/config/env'),
        NODE_ENV: 'production',
      }));
      productionApp = require('../src/app');
    });

    for (const url of ['/api-docs/', '/api-docs/openapi.yaml']) {
      const res = await request(productionApp).get(url);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    }
  });
});
