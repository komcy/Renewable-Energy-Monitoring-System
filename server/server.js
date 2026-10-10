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

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`[server] REMS API listening on http://localhost:${PORT}`));
};

start();

module.exports = app;
