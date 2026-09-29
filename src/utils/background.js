const { waitUntil } = require('@vercel/functions');
const { logger } = require('./logger');

// Roda `task` depois da resposta. Na Vercel, o waitUntil segura a função até a
// promise terminar; fora dela não faz nada e a promise segue sozinha. Como
// ninguém espera o resultado, o erro vai para o log. Devolve a promise (que
// nunca rejeita) para quem quiser esperar, como os testes.
function run(name, task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => {
      logger.error({ err, task: name }, 'Falha em tarefa em segundo plano');
    });
  waitUntil(promise);
  return promise;
}

module.exports = { run };
