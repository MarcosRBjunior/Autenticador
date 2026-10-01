const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const entry = require('../index');

// O index.js é a entrada da Vercel: conecta ao banco do MONGODB_URI. Aqui o
// mongoose.connect é desviado para o Mongo em memória (ou falha de propósito).
const realConnect = mongoose.connect.bind(mongoose);
let mongod;
let connectSpy;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

// O cache da conexão mora em global (sobrevive entre invocações na Vercel).
beforeEach(async () => {
  await mongoose.disconnect();
  delete global.__mongoose;
  connectSpy = jest.spyOn(mongoose, 'connect');
});

afterEach(() => connectSpy.mockRestore());

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('entrada da Vercel (index.js)', () => {
  it('conecta ao banco na primeira requisição e reaproveita a conexão', async () => {
    connectSpy.mockImplementation((_uri, options) => realConnect(mongod.getUri(), options));

    const first = await request(entry).get('/api/v1/health');
    const second = await request(entry).get('/api/v1/health');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: 'ok', db: 'up' });
    expect(second.status).toBe(200);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('com o banco fora do ar, segue para o app e tenta de novo na próxima requisição', async () => {
    connectSpy.mockRejectedValue(new Error('banco fora do ar'));

    const first = await request(entry).get('/api/v1/health');
    const second = await request(entry).get('/api/v1/health');

    expect(first.status).toBe(503);
    expect(first.body).toEqual({ status: 'error', db: 'down' });
    expect(second.status).toBe(503);
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });

  it('entrega as respostas do app, como o 401 das rotas protegidas', async () => {
    connectSpy.mockImplementation((_uri, options) => realConnect(mongod.getUri(), options));

    const res = await request(entry).get('/api/v1/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
