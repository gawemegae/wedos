const express = require('express');
const authMiddleware = require('../middleware/auth');
const videoController = require('../controllers/videoController');
const sessionController = require('../controllers/sessionController');
const scheduleController = require('../controllers/scheduleController');
const sessionData = require('../services/sessionData');

const router = express.Router();

// Auth check endpoint
router.get('/check-session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ 
      logged_in: true, 
      user: req.session.user 
    });
  } else {
    res.status(401).json({ 
      logged_in: false 
    });
  }
});

// Apply auth middleware to all other routes
router.use(authMiddleware.requireAuth);

// Video routes
router.get('/videos', videoController.listVideos);
router.post('/download', videoController.downloadVideo);
router.post('/videos/rename', videoController.renameVideo);
router.post('/videos/delete', videoController.deleteVideo);
router.post('/videos/delete-all', videoController.deleteAllVideos);
router.get('/disk-usage', videoController.getDiskUsage);

// Session routes
router.get('/sessions', sessionController.getActiveSessions);
router.post('/start', sessionController.startSession);
router.post('/stop', sessionController.stopSession);
router.post('/reactivate', sessionController.reactivateSession);
router.get('/inactive-sessions', sessionController.getInactiveSessions);
router.post('/delete-session', sessionController.deleteInactiveSession);
router.post('/inactive-sessions/delete-all', sessionController.deleteAllInactiveSessions);
router.post('/edit-session', sessionController.editInactiveSession);

// Schedule routes
router.get('/schedule-list', scheduleController.getSchedules);
router.post('/schedule', scheduleController.createSchedule);
router.post('/cancel-schedule', scheduleController.cancelSchedule);

// Cleanup route for orphaned services
router.post('/cleanup-orphaned', async (req, res) => {
  try {
    await sessionData.cleanupOrphanedServices();
    res.json({ 
      status: 'success', 
      message: 'Orphaned services cleaned up successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to cleanup orphaned services: ' + error.message 
    });
  }
});

module.exports = router;