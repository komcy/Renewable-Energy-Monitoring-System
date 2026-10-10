require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const plantRoutes = require('./routes/plantRoutes');
const assetRoutes = require('./routes/assetRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const alertRoutes = require('./routes/alertRoutes');
const simulatorRoutes = require('./routes/simulatorRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const simulator = require('./services/simulator');
const { rejectUnsafeKeys } = require('./middleware/sanitizeMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
// Large enough for telemetry batches (up to 5000 readings)
app.use(express.json({ limit: '5mb' }));
app.use(rejectUnsafeKeys);

// Health check: reports whether the API is up and the DB is connected
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    database: states[mongoose.connection.readyState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

let server;
let shuttingDown = false;

/** Stops the simulator (waiting for an in-flight tick), closes HTTP and the DB connection. */
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref();
  try {
    await simulator.stop('server shutdown');
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  } catch (err) {
    console.error('[server] error during shutdown:', err.message);
  }
  process.exit(0);
};

const signals = ['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : ['SIGUSR2'])];
for (const sig of signals) process.once(sig, () => shutdown(sig));

const start = async () => {
  await connectDB();
  server = app.listen(PORT, () => console.log(`[server] REMS API listening on http://localhost:${PORT}`));
  // Large CSV uploads are processed while they stream in; allow up to 15 min per request
  server.requestTimeout = 15 * 60 * 1000;

  if (process.env.SIMULATOR_AUTOSTART === 'true') {
    simulator
      .start({ intervalSeconds: process.env.SIMULATOR_INTERVAL_SECONDS, timeScale: process.env.SIMULATOR_TIME_SCALE, durationMinutes: 0 })
      .catch((err) => console.warn('[simulator] autostart skipped:', err.message));
  }
};

start();

module.exports = app;
