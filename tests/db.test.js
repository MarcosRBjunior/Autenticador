const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB, isDatabaseUp } = require('../src/config/db');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

// O cache mora em global de propósito (sobrevive entre invocações na Vercel),
// então cada teste zera a conexão e o cache para começar do mesmo ponto.
beforeEach(async () => {
  await mongoose.disconnect();
  delete global.__mongoose;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('connectDB', () => {
  it('conecta e reaproveita a conexão nas chamadas seguintes', async () => {
    const connectSpy = jest.spyOn(mongoose, 'connect');

    await connectDB(mongod.getUri());
    await connectDB(mongod.getUri());

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(mongoose.connection.readyState).toBe(1);
    connectSpy.mockRestore();
  });

  it('compartilha a mesma tentativa entre chamadas simultâneas', async () => {
    const connectSpy = jest.spyOn(mongoose, 'connect');

    await Promise.all([connectDB(mongod.getUri()), connectDB(mongod.getUri())]);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    connectSpy.mockRestore();
  });

  it('permite nova tentativa depois de uma falha', async () => {
    await expect(connectDB('uri-invalida')).rejects.toThrow();

    await connectDB(mongod.getUri());

    expect(mongoose.connection.readyState).toBe(1);
  });

  it('usa um pool pequeno de conexões', async () => {
    await connectDB(mongod.getUri());

    expect(mongoose.connection.getClient().options.maxPoolSize).toBe(5);
  });
});

describe('isDatabaseUp', () => {
  it('responde true com o banco conectado', async () => {
    await connectDB(mongod.getUri());

    await expect(isDatabaseUp()).resolves.toBe(true);
  });

  it('responde false sem conexão', async () => {
    await expect(isDatabaseUp()).resolves.toBe(false);
  });
});
