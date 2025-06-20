const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const authMiddleware = require('./src/middleware/auth');
const socketService = require('./src/services/socket');
const sessionManager = require('./src/services/sessionManager');
const scheduler = require('./src/services/scheduler');
const trialMode = require('./src/services/trialMode');

// Routes
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');
const videoRoutes = require('./src/routes/videos');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
socketService.init(server);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(authMiddleware.sessionMiddleware);

// Static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// Routes
app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/videos', videoRoutes);

// Serve main application
app.get('/', authMiddleware.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    status: 'error', 
    message: 'Internal server error' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    status: 'error', 
    message: 'Route not found' 
  });
});

// Initialize services
async function initializeServices() {
  try {
    // Initialize session manager
    await sessionManager.init();
    
    // Initialize scheduler
    await scheduler.init();
    
    // Initialize trial mode if enabled
    if (config.trialMode.enabled) {
      await trialMode.init();
    }
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
const PORT = config.server.port;
server.listen(PORT, async () => {
  logger.info(`StreamHib server running on port ${PORT}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`Trial mode: ${config.trialMode.enabled ? 'ENABLED' : 'DISABLED'}`);
  
  await initializeServices();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

module.exports = app;