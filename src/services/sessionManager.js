const path = require('path');
const moment = require('moment-timezone');
const config = require('../config/config');
const logger = require('../utils/logger');
const FileUtils = require('../utils/fileUtils');
const SystemctlUtils = require('../utils/systemctl');
const sessionData = require('./sessionData');
const socketService = require('./socket');

class SessionManager {
  constructor() {
    this.monitoringInterval = null;
    this.healthCheckInterval = null;
  }

  async init() {
    logger.info('Initializing Session Manager...');
    
    // Ensure required directories exist
    await FileUtils.ensureDir(path.dirname(config.paths.sessions));
    await FileUtils.ensureDir(config.paths.videos);
    
    // Start session monitoring (less frequent to prevent recovery loops)
    this.startSessionMonitoring();
    
    // Start health monitoring for active streams
    this.startHealthMonitoring();
    
    logger.info('Session Manager initialized');
  }

  startSessionMonitoring() {
    // Check sessions every 5 minutes instead of every minute
    this.monitoringInterval = setInterval(async () => {
      await this.checkSystemdSessions();
    }, 5 * 60000); // 5 minutes
  }

  startHealthMonitoring() {
    // Health check every 2 minutes for active streams
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 2 * 60000); // 2 minutes
  }

  async performHealthCheck() {
    try {
      logger.debug('Performing health check on active streams...');
      
      const activeSessions = await sessionData.getActiveSessions();
      
      for (const session of activeSessions) {
        const serviceName = `stream-${session.sanitized_service_id}.service`;
        
        try {
          const status = await SystemctlUtils.getServiceStatus(serviceName);
          
          if (!status.isActive) {
            logger.warn(`Service ${serviceName} is not active (${status.status}), attempting restart...`);
            
            // Try to restart the service
            await SystemctlUtils.startService(serviceName);
            
            // Log the restart attempt
            logger.info(`Attempted to restart service ${serviceName} for session ${session.id}`);
            
            // Emit notification to frontend
            socketService.emit('stream_restart_notification', {
              sessionId: session.id,
              sessionName: session.name,
              message: `Stream "${session.name}" was automatically restarted due to service failure`
            });
          }
        } catch (error) {
          logger.error(`Health check failed for session ${session.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Health check process failed:', error);
    }
  }

  async checkSystemdSessions() {
    try {
      logger.debug('Checking systemd sessions...');
      
      const runningServices = await SystemctlUtils.getRunningServices();
      const data = await sessionData.readSessions();
      const now = moment().tz(config.timezone);
      let needsUpdate = false;

      // Check one-time scheduled sessions for auto-stop
      for (const schedItem of data.scheduled_sessions) {
        if (schedItem.recurrence_type !== 'one_time' || schedItem.is_manual_stop) {
          continue;
        }

        try {
          const startTime = moment(schedItem.start_time_iso);
          const duration = schedItem.duration_minutes || 0;
          
          if (duration <= 0) continue;
          
          const stopTime = startTime.clone().add(duration, 'minutes');
          const serviceName = `stream-${schedItem.sanitized_service_id}.service`;

          if (now.isAfter(stopTime) && runningServices.includes(serviceName)) {
            logger.info(`Auto-stopping overdue one-time session: ${schedItem.session_name_original}`);
            await this.stopScheduledStreaming(schedItem.session_name_original);
            needsUpdate = true;
          }
        } catch (error) {
          logger.error(`Error checking one-time schedule ${schedItem.session_name_original}:`, error);
        }
      }

      // Check active sessions for auto-stop
      for (const activeSession of data.active_sessions) {
        const stopTimeIso = activeSession.stopTime;
        const sessionId = activeSession.id;
        const sanitizedId = activeSession.sanitized_service_id;

        if (!sessionId || !sanitizedId) {
          continue;
        }

        const serviceName = `stream-${sanitizedId}.service`;

        if (stopTimeIso && runningServices.includes(serviceName)) {
          try {
            const stopTime = moment(stopTimeIso).tz(config.timezone);
            
            if (now.isAfter(stopTime)) {
              logger.info(`Auto-stopping active session '${sessionId}' that passed its stop time`);
              await this.stopScheduledStreaming(sessionId);
              needsUpdate = true;
            }
          } catch (error) {
            logger.warn(`Invalid stopTime format for session '${sessionId}':`, error);
          }
        }
      }

      // Only check for orphaned sessions if there are running services
      if (runningServices.length > 0) {
        for (const activeSession of data.active_sessions) {
          const serviceName = `stream-${activeSession.sanitized_service_id}.service`;
          
          if (!runningServices.includes(serviceName)) {
            logger.info(`Moving orphaned session ${activeSession.id} to inactive`);
            activeSession.status = 'inactive';
            activeSession.stop_time = now.toISOString();
            
            data.inactive_sessions.push(activeSession);
            data.active_sessions = data.active_sessions.filter(s => s.id !== activeSession.id);
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await sessionData.writeSessions(data);
        
        // Emit updates
        const activeSessions = await sessionData.getActiveSessions();
        const inactiveSessions = await sessionData.getInactiveSessions();
        
        socketService.emit('sessions_update', activeSessions);
        socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });
      }
    } catch (error) {
      logger.error('Error in checkSystemdSessions:', error);
    }
  }

  async startScheduledStreaming(platform, streamKey, videoFile, sessionNameOriginal, 
                               oneTimeDurationMinutes = 0, recurrenceType = 'one_time',
                               dailyStartTime = null, dailyStopTime = null) {
    logger.info(`Starting scheduled stream: '${sessionNameOriginal}', Type: ${recurrenceType}`);
    
    const videoPath = path.join(config.paths.videos, videoFile);
    
    if (!await FileUtils.pathExists(videoPath)) {
      logger.error(`Video ${videoFile} not found for schedule '${sessionNameOriginal}'`);
      return;
    }

    const platformUrl = config.platforms[platform];
    
    try {
      // Create and start service
      const { serviceName, sanitizedId } = await SystemctlUtils.createServiceFile(
        sessionNameOriginal, 
        videoPath, 
        platformUrl, 
        streamKey
      );
      
      await SystemctlUtils.startService(serviceName);
      
      const currentStartTime = moment().tz(config.timezone).toISOString();
      let stopTimeIso = null;
      let durationMinutes = 0;
      let scheduleType = 'unknown';

      if (recurrenceType === 'daily' && dailyStartTime && dailyStopTime) {
        scheduleType = 'daily_recurring_instance';
        const [startH, startM] = dailyStartTime.split(':').map(Number);
        const [stopH, stopM] = dailyStopTime.split(':').map(Number);
        
        durationMinutes = (stopH * 60 + stopM) - (startH * 60 + startM);
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        
        const currentStart = moment(currentStartTime);
        stopTimeIso = currentStart.add(durationMinutes, 'minutes').toISOString();
      } else if (recurrenceType === 'one_time') {
        scheduleType = 'scheduled';
        durationMinutes = oneTimeDurationMinutes;
        
        if (durationMinutes > 0) {
          const currentStart = moment(currentStartTime);
          stopTimeIso = currentStart.add(durationMinutes, 'minutes').toISOString();
        }
      }

      const newActiveSession = {
        id: sessionNameOriginal,
        sanitized_service_id: sanitizedId,
        video_name: videoFile,
        stream_key: streamKey,
        platform: platform,
        status: 'active',
        start_time: currentStartTime,
        scheduleType: scheduleType,
        stopTime: stopTimeIso,
        duration_minutes: durationMinutes
      };

      await sessionData.addActiveSession(newActiveSession);

      // Remove one-time schedule after starting
      if (recurrenceType === 'one_time') {
        await sessionData.removeScheduledSession(sessionNameOriginal);
      }

      // Emit updates
      const activeSessions = await sessionData.getActiveSessions();
      const schedules = await sessionData.getScheduledSessions();
      
      socketService.emit('sessions_update', activeSessions);
      socketService.emit('schedules_update', schedules);

      logger.info(`Scheduled session '${sessionNameOriginal}' started successfully`);
    } catch (error) {
      logger.error(`Error starting scheduled streaming for '${sessionNameOriginal}':`, error);
    }
  }

  async stopScheduledStreaming(sessionNameOrId) {
    logger.info(`Stopping stream: '${sessionNameOrId}'`);
    
    const activeSession = await sessionData.getActiveSessionById(sessionNameOrId);
    
    if (!activeSession) {
      logger.warn(`Session '${sessionNameOrId}' not found in active sessions`);
      return;
    }

    const sanitizedId = activeSession.sanitized_service_id;
    if (!sanitizedId) {
      logger.error(`Cannot stop service for session '${sessionNameOrId}' - no sanitized_service_id`);
      return;
    }

    const serviceName = `stream-${sanitizedId}.service`;
    
    try {
      await SystemctlUtils.stopService(serviceName);
      await SystemctlUtils.removeServiceFile(serviceName);

      const stopTime = moment().tz(config.timezone).toISOString();
      activeSession.status = 'inactive';
      activeSession.stop_time = stopTime;

      await sessionData.addInactiveSession(activeSession);
      await sessionData.removeActiveSession(sessionNameOrId);

      // Emit updates
      const activeSessions = await sessionData.getActiveSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      const schedules = await sessionData.getScheduledSessions();
      
      socketService.emit('sessions_update', activeSessions);
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });
      socketService.emit('schedules_update', schedules);

      logger.info(`Session '${sessionNameOrId}' stopped and moved to inactive`);
    } catch (error) {
      logger.error(`Error stopping scheduled streaming for '${sessionNameOrId}':`, error);
    }
  }

  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

module.exports = new SessionManager();