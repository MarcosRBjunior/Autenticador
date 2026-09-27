const mongoose = require('mongoose');
const request = require('supertest');
const db = require('./helpers/db');
const app = require('../src/app');

describe('GET /api/v1/health', () => {
  describe('com o banco no ar', () => {
    beforeAll(db.connect);
    afterAll(db.close);

    it('responde 200 com db up', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', db: 'up' });
    });
  });

  describe('sem banco', () => {
    it('responde 503 com db down', async () => {
      expect(mongoose.connection.readyState).toBe(0);

      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'error', db: 'down' });
    });
  });
});
