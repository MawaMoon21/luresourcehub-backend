const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

const auth = require('./routes/authRoutes');
const resources = require('./routes/resourceRoutes');
const forum = require('./routes/forumRoutes');
const notifications = require('./routes/notificationRoutes');
const admin = require('./routes/adminRoutes');
const { apiLimiter } = require('./middleware/rateLimiter');

dotenv.config();

const app = express();

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Body parser
app.use(express.json({ limit: '10mb' }));

// CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Rate limiting (global)
app.use('/api', apiLimiter);

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', auth);
app.use('/api/resources', resources);
app.use('/api/forum', forum);
app.use('/api/notifications', notifications);
app.use('/api/admin', admin);

// Health check
app.get('/', (_req, res) => {
  res.json({ message: 'LUHub API', version: '2.0.0', status: 'ok' });
});

// 404
app.use('*', (_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Max 50MB.' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
