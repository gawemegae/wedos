const cron = require('node-cron');
const config = require('../config/config');
const logger = require('../utils/logger');
const FileUtils = require('../utils/fileUtils');
const SystemctlUtils = require('../utils/systemctl');
const sessionData = require('./sessionData');
const scheduler = require('./scheduler');
const socketService = require('./socket');
const resetTokenService = require('./resetTokenService');

class TrialMode {
  constructor() {
    this.resetJob = null;
    this.cleanupJob = null;
  }

  async init() {
    if (!config.trialMode.enabled) {
      logger.info('Trial mode is disabled');
      return;
    }

    logger.info(`Trial mode enabled - reset every ${config.trialMode.resetHours} hours`);
    
    // Schedule reset job
    const cronExpression = `0 */${config.trialMode.resetHours} * * *`;
    
    this.resetJob = cron.schedule(cronExpression, async () => {
      await this.performReset();
    }, {
      scheduled: true,
      timezone: config.timezone
    });

    // Schedule cleanup job for expired tokens (every hour)
    this.cleanupJob = cron.schedule('0 * * * *', async () => {
      await resetTokenService.cleanupExpiredTokens();
    }, {
      scheduled: true,
      timezone: config.timezone
    });

    // Emit trial status to connected clients
    socketService.emit('trial_status_update', {
      is_trial: true,
      message: `Mode Trial Aktif, Live, Schedule Live dan Video akan terhapus tiap ${config.trialMode.resetHours} jam karena server Reset tiap ${config.trialMode.resetHours} jam`
    });

    logger.info('Trial mode initialized');
  }

  async performReset() {
    if (!config.trialMode.enabled) {
      logger.info('Trial mode not active, skipping reset');
      return;
    }

    logger.info('TRIAL MODE: Starting application reset...');

    try {
      const data = await sessionData.readSessions();
      const activeSessions = [...(data.active_sessions || [])];

      // Stop and remove all active sessions
      logger.info(`TRIAL MODE: Stopping and removing ${activeSessions.length} active sessions...`);
      
      for (const session of activeSessions) {
        const sanitizedId = session.sanitized_service_id;
        if (!sanitizedId) {
          logger.warning(`TRIAL MODE: Skipping session without sanitized_service_id: ${session.id}`);
          continue;
        }

        const serviceName = `stream-${sanitizedId}.service`;
        
        try {
          await SystemctlUtils.stopService(serviceName);
          await SystemctlUtils.removeServiceFile(serviceName);
          logger.info(`TRIAL MODE: Service ${serviceName} stopped and removed`);

          // Move to inactive
          session.status = 'inactive';
          session.stop_time = new Date().toISOString();
          session.duration_minutes = session.duration_minutes || 0;
          
          data.inactive_sessions = data.inactive_sessions || [];
          data.inactive_sessions.push(session);
        } catch (error) {
          logger.error(`TRIAL MODE: Failed to stop/remove service ${serviceName}:`, error);
        }
      }

      data.active_sessions = [];

      // Remove all scheduled sessions
      logger.info(`TRIAL MODE: Removing all (${(data.scheduled_sessions || []).length}) schedules...`);
      
      const scheduledSessions = [...(data.scheduled_sessions || [])];
      for (const schedule of scheduledSessions) {
        try {
          await scheduler.removeSchedule(schedule);
        } catch (error) {
          logger.error(`TRIAL MODE: Failed to remove schedule ${schedule.session_name_original}:`, error);
        }
      }

      data.scheduled_sessions = [];

      // Delete all video files
      logger.info('TRIAL MODE: Deleting all video files...');
      const videos = await FileUtils.getVideoFiles(config.paths.videos);
      
      for (const videoFile of videos) {
        try {
          const videoPath = path.join(config.paths.videos, videoFile);
          await FileUtils.deleteFile(videoPath);
          logger.info(`TRIAL MODE: Video file ${videoFile} deleted`);
        } catch (error) {
          logger.error(`TRIAL MODE: Failed to delete video file ${videoFile}:`, error);
        }
      }

      // Clear reset tokens (but keep user accounts)
      logger.info('TRIAL MODE: Clearing reset tokens...');
      try {
        await FileUtils.writeJsonFile(config.paths.resetTokens, { tokens: [], attempts: {} });
        logger.info('TRIAL MODE: Reset tokens cleared');
      } catch (error) {
        logger.error('TRIAL MODE: Failed to clear reset tokens:', error);
      }

      // Save changes
      await sessionData.writeSessions(data);

      // Emit updates to all clients
      socketService.emit('sessions_update', []);
      socketService.emit('inactive_sessions_update', { inactive_sessions: data.inactive_sessions });
      socketService.emit('schedules_update', []);
      socketService.emit('videos_update', []);
      socketService.emit('trial_reset_notification', {
        message: 'Aplikasi telah direset karena mode trial. Semua sesi dan video telah dihapus.'
      });
      socketService.emit('trial_status_update', {
        is_trial: true,
        message: `Mode Trial Aktif - Reset setiap ${config.trialMode.resetHours} jam.`
      });

      logger.info('TRIAL MODE: Application reset completed');
    } catch (error) {
      logger.error('TRIAL MODE: Error during reset process:', error);
    }
  }

  destroy() {
    if (this.resetJob) {
      this.resetJob.destroy();
      this.resetJob = null;
    }
    if (this.cleanupJob) {
      this.cleanupJob.destroy();
      this.cleanupJob = null;
    }
  }
}

module.exports = new TrialMode();