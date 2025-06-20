const express = require('express');
const path = require('path');
const config = require('../config/config');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Serve video files
router.get('/:filename', authMiddleware.requireAuth, (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(config.paths.videos, filename);
  
  // Security check - prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Invalid filename' 
    });
  }

  res.sendFile(videoPath, (err) => {
    if (err) {
      logger.error(`Failed to serve video ${filename}:`, err);
      res.status(404).json({ 
        status: 'error', 
        message: 'Video not found' 
      });
    }
  });
});

module.exports = router;