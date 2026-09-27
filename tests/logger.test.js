const { createLogger } = require('../src/utils/logger');

// pino aceita qualquer objeto com write(); cada chamada recebe uma linha JSON.
function captureLogs() {
  const lines = [];
  const destination = { write: (chunk) => lines.push(chunk) };
  return { lines, destination };
}

describe('logger', () => {
  it.each([
    ['no topo', { password: 'segredo-1', token: 'segredo-2', newPassword: 'segredo-3' }],
    ['um nível abaixo', { user: { password: 'segredo-1', token: 'segredo-2' } }],
    ['dois níveis abaixo', { req: { body: { password: 'segredo-1', newPassword: 'segredo-3' } } }],
  ])('esconde senhas e tokens %s', (_where, payload) => {
    const { lines, destination } = captureLogs();
    const logger = createLogger({ level: 'info', destination });

    logger.info(payload, 'teste');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/segredo/);
    expect(lines[0]).toContain('[Redacted]');
  });

  it('esconde os headers authorization, cookie e set-cookie', () => {
    const { lines, destination } = captureLogs();
    const logger = createLogger({ level: 'info', destination });

    logger.info({
      req: { headers: { authorization: 'Bearer segredo', cookie: 'access_token=segredo' } },
      res: { headers: { 'set-cookie': 'access_token=segredo' } },
    });

    expect(lines[0]).not.toMatch(/segredo/);
  });

  it('mantém os campos comuns', () => {
    const { lines, destination } = captureLogs();
    const logger = createLogger({ level: 'info', destination });

    logger.info({ user: { username: 'ana' } }, 'login');

    expect(JSON.parse(lines[0])).toMatchObject({ user: { username: 'ana' }, msg: 'login' });
  });
});
