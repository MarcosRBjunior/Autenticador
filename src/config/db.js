const mongoose = require('mongoose');
const env = require('./env');

// Em ambiente serverless o processo é reaproveitado entre invocações; guardar
// a conexão em global evita abrir um pool novo a cada requisição.
const getCache = () => (global.__mongoose ??= { conn: null, promise: null });

async function connectDB(uri = env.MONGODB_URI) {
  const cached = getCache();
  if (cached.conn) return cached.conn;

  cached.promise ??= mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // a próxima chamada tenta de novo
    throw err;
  }
  return cached.conn;
}

async function isDatabaseUp() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { connectDB, isDatabaseUp };
