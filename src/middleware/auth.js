const session = require('express-session');
const config = require('../config/config');
const logger = require('../utils/logger');

// Session middleware
const sessionMiddleware = session({
  secret: config.session.secret,
  resave: config.session.resave,
  saveUninitialized: config.session.saveUninitialized,
  cookie: config.session.cookie
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Authentication required' 
      });
    } else {
      const nextUrl = encodeURIComponent(req.originalUrl);
      return res.redirect(`/login?next=${nextUrl}`);
    }
  }
};

// Optional auth middleware (doesn't redirect)
const optionalAuth = (req, res, next) => {
  // Just continue, auth status will be checked in route handlers
  next();
};

module.exports = {
  sessionMiddleware,
  requireAuth,
  optionalAuth
};