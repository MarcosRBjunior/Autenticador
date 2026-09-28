const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Cada arquivo de teste sobe o próprio Mongo em memória, isolado dos demais
// e sem depender de um banco rodando na máquina ou no CI.
//
// Rode sempre via `npm test`: o script liga --experimental-vm-modules. Sem a
// flag, o driver 7 do Mongo não consegue fazer `import('os')` dentro do vm do
// Jest, envia o handshake sem metadados e o mongod recusa a conexão.
let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function close() {
  await mongoose.disconnect();
  await mongod?.stop();
}

// Para processos filhos (ex.: scripts de linha de comando) usarem o mesmo banco.
const uri = () => mongod.getUri();

module.exports = { connect, clear, close, uri };
