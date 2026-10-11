require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
const simulator = require('./services/simulator');

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  const msg = '[server] JWT_SECRET is missing or shorter than 32 characters';
  if (process.env.NODE_ENV === 'production') {
    console.error(`${msg}; refusing to start in production.`);
    process.exit(1);
  }
  console.warn(`${msg}. Set a long random secret before deploying.`);
}

let server;
let shuttingDown = false;

/**
 * Graceful shutdown: stop the simulator (waiting for an in-flight tick), stop
 * accepting connections, close the DB, then exit. Forced exit after 8 s.
 */
const shutdown = async (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${reason}; shutting down...`);
  const force = setTimeout(() => process.exit(exitCode || 1), 8000);
  force.unref();
  try {
    await simulator.stop('server shutdown');
    if (server) {
      server.closeIdleConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('[server] error during shutdown:', err.message);
  }
  process.exit(exitCode);
};

const signals = ['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : ['SIGUSR2'])];
for (const sig of signals) process.once(sig, () => shutdown(`${sig} received`));

// A bug that escapes every handler leaves the process in an unknown state: log it and restart cleanly
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
  shutdown('unhandled rejection', 1);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
  shutdown('uncaught exception', 1);
});

const start = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`[server] REMS API listening on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
    if (app.serveClient) console.log('[server] serving the built client from client/dist');
  });
  // Large CSV uploads are processed while they stream in; allow up to 15 min per request
  server.requestTimeout = 15 * 60 * 1000;

  if (process.env.SIMULATOR_AUTOSTART === 'true') {
    simulator
      .start({ intervalSeconds: process.env.SIMULATOR_INTERVAL_SECONDS, timeScale: process.env.SIMULATOR_TIME_SCALE, durationMinutes: 0 })
      .catch((err) => console.warn('[simulator] autostart skipped:', err.message));
  }
};

start();
