require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { initFirebase } = require('./firebase');

const authMiddleware   = require('./middleware/auth');
const availabilityRouter = require('./routes/availability');
const bookingsRouter     = require('./routes/bookings');
const feedRouter         = require('./routes/feed');
const notificationsRouter = require('./routes/notifications');

// ── Init ──────────────────────────────────────────────
initFirebase();
const app  = express();
const PORT = process.env.PORT || 8080;

// ── Global middleware ─────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check (χωρίς auth — για Cloud Run) ─────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TableReserve Google Booking API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Public feed (χωρίς auth — η Google το τραβά μόνη) ─
app.use('/feeds', feedRouter);

// ── Authenticated Google Booking API endpoints ────────
app.use('/v3/availability',   authMiddleware, availabilityRouter);
app.use('/v3/bookings',       authMiddleware, bookingsRouter);
app.use('/v3/notifications',  authMiddleware, notificationsRouter);

// ── 404 handler ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: { code: 404, message: `Route ${req.path} not found`, status: 'NOT_FOUND' }
  });
});

// ── Global error handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
  });
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════╗
║   TableReserve Google Booking API          ║
║   Listening on port ${PORT}                   ║
╚════════════════════════════════════════════╝

  Endpoints:
  GET  /health
  GET  /feeds/merchants.xml
  GET  /v3/availability
  POST /v3/bookings
  GET  /v3/bookings/:id
  PATCH /v3/bookings/:id
  POST /v3/notifications
  `);
});

module.exports = app;
