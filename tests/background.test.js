const background = require('../src/utils/background');
const { logger } = require('../src/utils/logger');

// Onde a Vercel expõe o contexto da requisição (ver @vercel/functions/get-context).
const VERCEL_CONTEXT = Symbol.for('@vercel/request-context');

afterEach(() => {
  delete globalThis[VERCEL_CONTEXT];
  jest.restoreAllMocks();
});

describe('background.run', () => {
  // Sem o waitUntil, a Vercel congela a função logo depois da resposta e o
  // e-mail pode nunca sair.
  it('na Vercel, entrega a tarefa ao waitUntil, que espera ela acabar', async () => {
    const waitUntil = jest.fn();
    globalThis[VERCEL_CONTEXT] = { get: () => ({ waitUntil }) };
    let finished = false;

    background.run('teste', async () => {
      finished = true;
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(finished).toBe(true);
  });

  it('fora da Vercel, a tarefa roda do mesmo jeito', async () => {
    const task = jest.fn();

    await background.run('teste', task);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('não deixa o erro da tarefa escapar: registra no log com o nome dela', async () => {
    const logError = jest.spyOn(logger, 'error');
    const failure = new Error('falhou');

    await expect(
      background.run('password_reset_request', async () => {
        throw failure;
      }),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      { err: failure, task: 'password_reset_request' },
      expect.any(String),
    );
  });
});
