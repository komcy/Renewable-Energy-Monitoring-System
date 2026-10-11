const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');

const ApiError = require('./utils/ApiError');
const authRoutes = require('./routes/authRoutes');
const plantRoutes = require('./routes/plantRoutes');
const assetRoutes = require('./routes/assetRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const alertRoutes = require('./routes/alertRoutes');
const simulatorRoutes = require('./routes/simulatorRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const userRoutes = require('./routes/userRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { rejectUnsafeKeys } = require('./middleware/sanitizeMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const serveClient = isProduction && fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

// Behind a reverse proxy (Render, Nginx, ...) set TRUST_PROXY=1 so rate limits see real client IPs
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// ------------------------------------------------------------- security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        // Plant detail embeds an OpenStreetMap view
        frameSrc: ['https://www.openstreetmap.org'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ------------------------------------------------------------- CORS (allow-list)
// CLIENT_URL may list several origins, comma-separated
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsBase = {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
};

app.use(
  cors((req, callback) => {
    const origin = req.get('Origin');
    // Same-origin: the UI served by this server (whatever host name it was opened with)
    const self = `${req.protocol}://${req.get('host')}`;
    // No Origin header: same-origin GETs, curl, server-to-server
    if (!origin || origin === self || allowedOrigins.includes(origin)) {
      return callback(null, { ...corsBase, origin: true });
    }
    return callback(new ApiError(403, `Origin ${origin} is not allowed`));
  })
);

// ------------------------------------------------------------- rate limiting
const limitHandler = (message) => (req, res, next, options) =>
  next(new ApiError(options.statusCode, message));

// Brute-force protection: only failed attempts count towards the limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: limitHandler('Too many attempts. Please wait 15 minutes and try again.'),
});

// Generous ceiling for the whole API (dashboards poll every 20–60 s)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT) || 3000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('Too many requests. Please slow down and try again shortly.'),
});

// ------------------------------------------------------------- body parsing
// Large enough for telemetry batches (up to 5000 readings)
app.use(express.json({ limit: '5mb' }));
app.use(rejectUnsafeKeys);

// ------------------------------------------------------------- routes
// Health check: reports whether the API is up and the DB is connected (not rate limited)
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    database: states[mongoose.connection.readyState] || 'unknown',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/change-password'], authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/reports', reportRoutes);

// ------------------------------------------------------------- built client (production)
// With NODE_ENV=production and client/dist built, the API also serves the SPA
if (serveClient) {
  // Hashed assets never change, so cache them long-term (registered first so it wins)
  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
module.exports.serveClient = serveClient;
