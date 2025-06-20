const path = require('path');
const moment = require('moment-timezone');
const config = require('../config/config');
const logger = require('../utils/logger');
const FileUtils = require('../utils/fileUtils');
const SystemctlUtils = require('../utils/systemctl');
const sessionData = require('../services/sessionData');
const socketService = require('../services/socket');

class SessionController {
  static async getActiveSessions(req, res) {
    try {
      const activeSessions = await sessionData.getActiveSessions();
      res.json(activeSessions);
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to retrieve active sessions' 
      });
    }
  }

  static async startSession(req, res) {
    const { session_name, video_file, stream_key, platform } = req.body;

    if (!session_name || !video_file || !stream_key || !platform) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Semua field wajib diisi dan nama sesi tidak boleh kosong.' 
      });
    }

    try {
      const videoPath = path.join(config.paths.videos, video_file);
      
      if (!await FileUtils.pathExists(videoPath)) {
        return res.status(404).json({ 
          status: 'error', 
          message: `File video ${video_file} tidak ditemukan` 
        });
      }

      if (!config.platforms[platform]) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Platform tidak valid. Pilih YouTube atau Facebook.' 
        });
      }

      const platformUrl = config.platforms[platform];
      
      // Create and start service
      const { serviceName, sanitizedId } = await SystemctlUtils.createServiceFile(
        session_name, 
        videoPath, 
        platformUrl, 
        stream_key
      );
      
      await SystemctlUtils.startService(serviceName);

      // Add to active sessions
      const startTime = moment().tz(config.timezone).toISOString();
      const newSession = {
        id: session_name,
        sanitized_service_id: sanitizedId,
        video_name: video_file,
        stream_key: stream_key,
        platform: platform,
        status: 'active',
        start_time: startTime,
        scheduleType: 'manual',
        stopTime: null,
        duration_minutes: 0
      };

      await sessionData.addActiveSession(newSession);
      await sessionData.removeInactiveSession(session_name);

      // Emit updates
      const activeSessions = await sessionData.getActiveSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      
      socketService.emit('sessions_update', activeSessions);
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message: `Berhasil memulai Live Stream untuk sesi "${session_name}"` 
      });

    } catch (error) {
      logger.error('Start session error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async stopSession(req, res) {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID sesi (nama sesi asli) diperlukan' 
      });
    }

    try {
      const activeSession = await sessionData.getActiveSessionById(session_id);
      
      let sanitizedServiceId;
      if (activeSession && activeSession.sanitized_service_id) {
        sanitizedServiceId = activeSession.sanitized_service_id;
      } else {
        sanitizedServiceId = SystemctlUtils.sanitizeServiceName(session_id);
        logger.warn(`Using fallback sanitized_service_id '${sanitizedServiceId}' for session '${session_id}'`);
      }

      const serviceName = `stream-${sanitizedServiceId}.service`;

      // Stop and remove service
      await SystemctlUtils.stopService(serviceName);
      await SystemctlUtils.removeServiceFile(serviceName);

      const stopTime = moment().tz(config.timezone).toISOString();

      if (activeSession) {
        // Move to inactive sessions
        activeSession.status = 'inactive';
        activeSession.stop_time = stopTime;
        
        await sessionData.addInactiveSession(activeSession);
        await sessionData.removeActiveSession(session_id);
      } else {
        // Create inactive session entry
        const inactiveSession = {
          id: session_id,
          sanitized_service_id: sanitizedServiceId,
          video_name: 'unknown (force stop)',
          stream_key: 'unknown',
          platform: 'unknown',
          status: 'inactive',
          stop_time: stopTime,
          duration_minutes: 0,
          scheduleType: 'manual_force_stop'
        };
        
        await sessionData.addInactiveSession(inactiveSession);
      }

      // Emit updates
      const activeSessions = await sessionData.getActiveSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      
      socketService.emit('sessions_update', activeSessions);
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message: `Sesi "${session_id}" berhasil dihentikan atau sudah tidak aktif.` 
      });

    } catch (error) {
      logger.error('Stop session error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async reactivateSession(req, res) {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID sesi (nama sesi asli) diperlukan' 
      });
    }

    try {
      const inactiveSession = await sessionData.getInactiveSessionById(session_id);
      
      if (!inactiveSession) {
        return res.status(404).json({ 
          status: 'error', 
          message: `Sesi '${session_id}' tidak ada di daftar tidak aktif.` 
        });
      }

      const { video_name, stream_key } = inactiveSession;
      const platform = req.body.platform || inactiveSession.platform || 'YouTube';

      if (!video_name || !stream_key) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Detail video atau stream key tidak lengkap untuk reaktivasi.' 
        });
      }

      const videoPath = path.join(config.paths.videos, video_name);
      
      if (!await FileUtils.pathExists(videoPath)) {
        return res.status(404).json({ 
          status: 'error', 
          message: `File video '${video_name}' tidak ditemukan untuk reaktivasi.` 
        });
      }

      const platformUrl = config.platforms[platform] || config.platforms.YouTube;

      // Create and start service
      const { serviceName, sanitizedId } = await SystemctlUtils.createServiceFile(
        session_id, 
        videoPath, 
        platformUrl, 
        stream_key
      );
      
      await SystemctlUtils.startService(serviceName);

      // Update session data
      inactiveSession.status = 'active';
      inactiveSession.start_time = moment().tz(config.timezone).toISOString();
      inactiveSession.platform = platform;
      inactiveSession.sanitized_service_id = sanitizedId;
      delete inactiveSession.stop_time;
      inactiveSession.scheduleType = 'manual_reactivated';
      inactiveSession.stopTime = null;
      inactiveSession.duration_minutes = 0;

      await sessionData.removeInactiveSession(session_id);
      await sessionData.addActiveSession(inactiveSession);

      // Emit updates
      const activeSessions = await sessionData.getActiveSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      
      socketService.emit('sessions_update', activeSessions);
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message: `Sesi '${session_id}' berhasil diaktifkan kembali (Live Sekarang).`,
        platform: platform 
      });

    } catch (error) {
      logger.error('Reactivate session error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server Internal: ' + error.message 
      });
    }
  }

  static async getInactiveSessions(req, res) {
    try {
      const inactiveSessions = await sessionData.getInactiveSessions();
      res.json({ inactive_sessions: inactiveSessions });
    } catch (error) {
      logger.error('Failed to get inactive sessions:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to retrieve inactive sessions' 
      });
    }
  }

  static async deleteInactiveSession(req, res) {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID sesi (nama sesi asli) diperlukan' 
      });
    }

    try {
      const inactiveSession = await sessionData.getInactiveSessionById(session_id);
      
      if (!inactiveSession) {
        return res.status(404).json({ 
          status: 'error', 
          message: `Sesi '${session_id}' tidak ditemukan di daftar tidak aktif.` 
        });
      }

      await sessionData.removeInactiveSession(session_id);

      // Emit update
      const inactiveSessions = await sessionData.getInactiveSessions();
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message: `Sesi '${session_id}' berhasil dihapus dari daftar tidak aktif.` 
      });

    } catch (error) {
      logger.error('Delete inactive session error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async deleteAllInactiveSessions(req, res) {
    try {
      const inactiveSessions = await sessionData.getInactiveSessions();
      const deletedCount = inactiveSessions.length;

      if (deletedCount === 0) {
        return res.json({ 
          status: 'success', 
          message: 'Tidak ada sesi nonaktif untuk dihapus.',
          deleted_count: 0 
        });
      }

      await sessionData.clearInactiveSessions();

      // Emit update
      socketService.emit('inactive_sessions_update', { inactive_sessions: [] });

      res.json({ 
        status: 'success', 
        message: `Berhasil menghapus ${deletedCount} sesi tidak aktif.`,
        deleted_count: deletedCount 
      });

    } catch (error) {
      logger.error('Delete all inactive sessions error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async editInactiveSession(req, res) {
    const { session_name_original, stream_key, video_file, platform } = req.body;
    const sessionId = session_name_original || req.body.id;

    if (!sessionId) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID sesi (nama sesi asli) diperlukan untuk edit.' 
      });
    }

    try {
      const inactiveSession = await sessionData.getInactiveSessionById(sessionId);
      
      if (!inactiveSession) {
        return res.status(404).json({ 
          status: 'error', 
          message: `Sesi '${sessionId}' tidak ditemukan di daftar tidak aktif.` 
        });
      }

      if (!stream_key || !video_file) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Stream key dan nama video baru diperlukan untuk update.' 
        });
      }

      const videoPath = path.join(config.paths.videos, video_file);
      
      if (!await FileUtils.pathExists(videoPath)) {
        return res.status(404).json({ 
          status: 'error', 
          message: `File video baru '${video_file}' tidak ditemukan.` 
        });
      }

      // Update session data
      inactiveSession.stream_key = stream_key.trim();
      inactiveSession.video_name = video_file;
      inactiveSession.platform = platform || 'YouTube';

      await sessionData.updateInactiveSession(sessionId, inactiveSession);

      // Emit update
      const inactiveSessions = await sessionData.getInactiveSessions();
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message: `Detail sesi tidak aktif '${sessionId}' berhasil diperbarui.` 
      });

    } catch (error) {
      logger.error('Edit inactive session error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server Internal: ' + error.message 
      });
    }
  }
}

module.exports = SessionController;