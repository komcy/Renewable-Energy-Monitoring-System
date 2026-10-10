const mongoose = require('mongoose');

/**
 * Connect to MongoDB (Atlas) using MONGO_URI from the environment.
 * Exits the process if the initial connection fails so the server never
 * runs without a database.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[db] MONGO_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected'));
  mongoose.connection.on('error', (err) => console.error('[db] MongoDB error:', err.message));

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log(`[db] MongoDB connected: ${conn.connection.host} / ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] Initial MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
