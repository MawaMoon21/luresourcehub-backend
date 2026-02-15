const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Route files
const auth = require('./routes/authRoutes');

// Load env vars
dotenv.config();

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

// Mount routers
app.use('/api/auth', auth);

// Welcome route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to LUResourceHub API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth'
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app;