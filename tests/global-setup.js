const { MongoBinary } = require('mongodb-memory-server');

// Baixa o binário do mongod uma única vez antes das suítes. Sem isso, o
// primeiro download acontece dentro de um beforeAll e estoura o timeout do
// Jest (o npm 11 não roda o postinstall do pacote por padrão).
module.exports = async () => {
  await MongoBinary.getPath();
};
