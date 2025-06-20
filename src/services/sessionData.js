const moment = require('moment-timezone');
const config = require('../config/config');
const logger = require('../utils/logger');
const database = require('./database');
const SystemctlUtils = require('../utils/systemctl');

class SessionData {
  constructor() {
    this.db = database;
    this.recoveryInProgress = false; // Prevent multiple recovery attempts
  }

  async getActiveSessions() {
    try {
      // Prevent concurrent recovery operations
      if (this.recoveryInProgress) {
        logger.debug('Recovery in progress, skipping session check');
        const dbSessions = await this.db.getActiveSessions();
        return this.formatActiveSessions(dbSessions);
      }

      const runningServices = await SystemctlUtils.getRunningServices();
      const dbSessions = await this.db.getActiveSessions();
      const activeSessions = [];
      let needsUpdate = false;

      // Check running services and match with database
      for (const serviceName of runningServices) {
        const sanitizedId = serviceName.replace('stream-', '').replace('.service', '');
        
        // Skip if this is a recovered session (prevent infinite recovery)
        if (sanitizedId.startsWith('recovered-')) {
          logger.warn(`Skipping recovered session service: ${serviceName}`);
          continue;
        }
        
        // Find session in database
        const sessionDb = dbSessions.find(s => 
          s.sanitizedServiceId === sanitizedId
        );

        if (sessionDb) {
          // Format stop time for display
          let formattedStopTime = null;
          if (sessionDb.stopTime) {
            try {
              const stopTime = moment(sessionDb.stopTime).tz(config.timezone);
              formattedStopTime = stopTime.format('DD-MM-YYYY [Pukul] HH:mm:ss');
            } catch (e) {
              // Ignore formatting errors
            }
          }

          activeSessions.push({
            id: sessionDb.sessionName,
            name: sessionDb.sessionName,
            startTime: sessionDb.startTime.toISOString(),
            platform: sessionDb.platform,
            video_name: sessionDb.videoName,
            stream_key: sessionDb.streamKey,
            stopTime: formattedStopTime,
            scheduleType: sessionDb.scheduleType,
            sanitized_service_id: sessionDb.sanitizedServiceId
          });
        } else {
          // Only recover if not already a recovered session
          logger.warn(`Service ${serviceName} running but not in database - will be handled by cleanup`);
        }
      }

      // Check for sessions in database that are not running (move to inactive)
      for (const activeSession of dbSessions) {
        const serviceName = `stream-${activeSession.sanitizedServiceId}.service`;
        
        if (!runningServices.includes(serviceName)) {
          logger.info(`Session ${activeSession.sessionName} not running in systemd, moving to inactive`);
          
          await this.db.updateSession(activeSession.id, {
            status: 'inactive',
            stopTime: new Date()
          });
          
          needsUpdate = true;
        }
      }

      return activeSessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      return [];
    }
  }

  formatActiveSessions(dbSessions) {
    return dbSessions.map(sessionDb => {
      let formattedStopTime = null;
      if (sessionDb.stopTime) {
        try {
          const stopTime = moment(sessionDb.stopTime).tz(config.timezone);
          formattedStopTime = stopTime.format('DD-MM-YYYY [Pukul] HH:mm:ss');
        } catch (e) {
          // Ignore formatting errors
        }
      }

      return {
        id: sessionDb.sessionName,
        name: sessionDb.sessionName,
        startTime: sessionDb.startTime.toISOString(),
        platform: sessionDb.platform,
        video_name: sessionDb.videoName,
        stream_key: sessionDb.streamKey,
        stopTime: formattedStopTime,
        scheduleType: sessionDb.scheduleType,
        sanitized_service_id: sessionDb.sanitizedServiceId
      };
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async getInactiveSessions() {
    try {
      const inactiveSessions = await this.db.getInactiveSessions();
      
      return inactiveSessions.map(session => ({
        id: session.sessionName,
        sanitized_service_id: session.sanitizedServiceId,
        video_name: session.videoName,
        stream_key: session.streamKey,
        platform: session.platform,
        status: session.status,
        start_time_original: session.startTime.toISOString(),
        stop_time: session.stopTime ? session.stopTime.toISOString() : null,
        duration_minutes_original: session.durationMinutes
      })).sort((a, b) => 
        (b.stop_time || '').localeCompare(a.stop_time || '')
      );
    } catch (error) {
      logger.error('Failed to get inactive sessions:', error);
      return [];
    }
  }

  async getScheduledSessions() {
    try {
      const schedules = await this.db.getActiveSchedules();
      const scheduledSessions = [];

      for (const schedule of schedules) {
        try {
          const displayEntry = {
            id: schedule.id,
            session_name_original: schedule.sessionNameOriginal,
            video_file: schedule.videoFile,
            platform: schedule.platform,
            stream_key: schedule.streamKey,
            recurrence_type: schedule.recurrenceType,
            sanitized_service_id: schedule.sanitizedServiceId
          };

          if (schedule.recurrenceType === 'daily') {
            displayEntry.start_time_display = `Setiap hari pukul ${schedule.startTimeOfDay}`;
            displayEntry.stop_time_display = `Berakhir pukul ${schedule.stopTimeOfDay}`;
            displayEntry.is_manual_stop = false;
          } else if (schedule.recurrenceType === 'one_time') {
            const startTime = moment(schedule.startTimeIso).tz(config.timezone);
            displayEntry.start_time_iso = startTime.toISOString();
            displayEntry.start_time_display = startTime.format('DD-MM-YYYY HH:mm:ss');
            
            if (schedule.isManualStop) {
              displayEntry.stop_time_display = 'Stop Manual';
            } else {
              const stopTime = startTime.clone().add(schedule.durationMinutes, 'minutes');
              displayEntry.stop_time_display = stopTime.format('DD-MM-YYYY HH:mm:ss');
            }
            displayEntry.is_manual_stop = schedule.isManualStop;
          }

          scheduledSessions.push(displayEntry);
        } catch (error) {
          logger.error(`Error processing schedule ${schedule.sessionNameOriginal}:`, error);
        }
      }

      return scheduledSessions.sort((a, b) => {
        // Sort by recurrence type (daily first), then by start time
        if (a.recurrence_type !== b.recurrence_type) {
          return a.recurrence_type === 'daily' ? -1 : 1;
        }
        return (a.start_time_iso || a.session_name_original)
          .localeCompare(b.start_time_iso || b.session_name_original);
      });
    } catch (error) {
      logger.error('Failed to get scheduled sessions:', error);
      return [];
    }
  }

  async addActiveSession(session) {
    try {
      // Get first user as default owner
      const users = await this.db.prisma.user.findMany({ take: 1 });
      const userId = users.length > 0 ? users[0].id : null;
      
      if (!userId) {
        throw new Error('No users found in database');
      }

      // Remove existing session with same name
      await this.removeActiveSession(session.id);

      const sessionData = {
        sessionName: session.id,
        sanitizedServiceId: session.sanitized_service_id,
        videoName: session.video_name,
        streamKey: session.stream_key,
        platform: session.platform,
        status: 'active',
        startTime: new Date(session.start_time),
        scheduleType: session.scheduleType || 'manual',
        durationMinutes: session.duration_minutes || 0,
        userId: userId
      };

      if (session.stopTime) {
        sessionData.stopTime = new Date(session.stopTime);
      }

      return await this.db.createSession(sessionData);
    } catch (error) {
      logger.error('Failed to add active session:', error);
      throw error;
    }
  }

  async removeActiveSession(sessionId) {
    try {
      const session = await this.db.getSessionByName(sessionId);
      if (session && session.status === 'active') {
        await this.db.deleteSession(session.id);
      }
      return true;
    } catch (error) {
      logger.error('Failed to remove active session:', error);
      return false;
    }
  }

  async getActiveSessionById(sessionId) {
    try {
      const session = await this.db.getSessionByName(sessionId);
      if (session && session.status === 'active') {
        return {
          id: session.sessionName,
          sanitized_service_id: session.sanitizedServiceId,
          video_name: session.videoName,
          stream_key: session.streamKey,
          platform: session.platform,
          status: session.status,
          start_time: session.startTime.toISOString(),
          scheduleType: session.scheduleType,
          stopTime: session.stopTime ? session.stopTime.toISOString() : null,
          duration_minutes: session.durationMinutes
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to get active session by ID:', error);
      return null;
    }
  }

  async addInactiveSession(session) {
    try {
      // Get first user as default owner
      const users = await this.db.prisma.user.findMany({ take: 1 });
      const userId = users.length > 0 ? users[0].id : null;
      
      if (!userId) {
        throw new Error('No users found in database');
      }

      // Remove existing session with same name
      await this.removeInactiveSession(session.id);

      const sessionData = {
        sessionName: session.id,
        sanitizedServiceId: session.sanitized_service_id,
        videoName: session.video_name,
        streamKey: session.stream_key,
        platform: session.platform,
        status: 'inactive',
        startTime: new Date(session.start_time || session.startTime),
        stopTime: new Date(session.stop_time || session.stopTime || new Date()),
        scheduleType: session.scheduleType || 'manual',
        durationMinutes: session.duration_minutes || 0,
        userId: userId
      };

      return await this.db.createSession(sessionData);
    } catch (error) {
      logger.error('Failed to add inactive session:', error);
      throw error;
    }
  }

  async removeInactiveSession(sessionId) {
    try {
      const session = await this.db.getSessionByName(sessionId);
      if (session && session.status === 'inactive') {
        await this.db.deleteSession(session.id);
      }
      return true;
    } catch (error) {
      logger.error('Failed to remove inactive session:', error);
      return false;
    }
  }

  async getInactiveSessionById(sessionId) {
    try {
      const session = await this.db.getSessionByName(sessionId);
      if (session && session.status === 'inactive') {
        return {
          id: session.sessionName,
          sanitized_service_id: session.sanitizedServiceId,
          video_name: session.videoName,
          stream_key: session.streamKey,
          platform: session.platform,
          status: session.status,
          start_time: session.startTime.toISOString(),
          stop_time: session.stopTime ? session.stopTime.toISOString() : null,
          scheduleType: session.scheduleType,
          duration_minutes: session.durationMinutes
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to get inactive session by ID:', error);
      return null;
    }
  }

  async updateInactiveSession(sessionId, updatedSession) {
    try {
      const session = await this.db.getSessionByName(sessionId);
      if (session && session.status === 'inactive') {
        const updateData = {
          streamKey: updatedSession.stream_key,
          videoName: updatedSession.video_name,
          platform: updatedSession.platform
        };
        
        await this.db.updateSession(session.id, updateData);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to update inactive session:', error);
      return false;
    }
  }

  async clearInactiveSessions() {
    try {
      await this.db.deleteInactiveSessions();
      return true;
    } catch (error) {
      logger.error('Failed to clear inactive sessions:', error);
      return false;
    }
  }

  async addScheduledSession(schedule) {
    try {
      // Get first user as default owner
      const users = await this.db.prisma.user.findMany({ take: 1 });
      const userId = users.length > 0 ? users[0].id : null;
      
      if (!userId) {
        throw new Error('No users found in database');
      }

      // Remove existing schedule with same session name
      await this.removeScheduledSession(schedule.session_name_original);

      const scheduleData = {
        sessionNameOriginal: schedule.session_name_original,
        sanitizedServiceId: schedule.sanitized_service_id,
        platform: schedule.platform,
        streamKey: schedule.stream_key,
        videoFile: schedule.video_file,
        recurrenceType: schedule.recurrence_type,
        userId: userId
      };

      if (schedule.recurrence_type === 'one_time') {
        scheduleData.startTimeIso = new Date(schedule.start_time_iso);
        scheduleData.durationMinutes = schedule.duration_minutes;
        scheduleData.isManualStop = schedule.is_manual_stop;
      } else if (schedule.recurrence_type === 'daily') {
        scheduleData.startTimeOfDay = schedule.start_time_of_day;
        scheduleData.stopTimeOfDay = schedule.stop_time_of_day;
      }

      return await this.db.createSchedule(scheduleData);
    } catch (error) {
      logger.error('Failed to add scheduled session:', error);
      throw error;
    }
  }

  async removeScheduledSession(sessionName) {
    try {
      await this.db.deleteScheduleBySessionName(sessionName);
      return true;
    } catch (error) {
      logger.error('Failed to remove scheduled session:', error);
      return false;
    }
  }

  async removeScheduledSessionById(scheduleId) {
    try {
      await this.db.deleteSchedule(scheduleId);
      return true;
    } catch (error) {
      logger.error('Failed to remove scheduled session by ID:', error);
      return false;
    }
  }

  async getScheduledSessionById(scheduleId) {
    try {
      const schedule = await this.db.getScheduleById(scheduleId);
      if (schedule) {
        return {
          id: schedule.id,
          session_name_original: schedule.sessionNameOriginal,
          sanitized_service_id: schedule.sanitizedServiceId,
          platform: schedule.platform,
          stream_key: schedule.streamKey,
          video_file: schedule.videoFile,
          recurrence_type: schedule.recurrenceType,
          start_time_iso: schedule.startTimeIso ? schedule.startTimeIso.toISOString() : null,
          duration_minutes: schedule.durationMinutes,
          is_manual_stop: schedule.isManualStop,
          start_time_of_day: schedule.startTimeOfDay,
          stop_time_of_day: schedule.stopTimeOfDay
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to get scheduled session by ID:', error);
      return null;
    }
  }

  // Cleanup orphaned services (run manually, not automatically)
  async cleanupOrphanedServices() {
    try {
      this.recoveryInProgress = true;
      logger.info('Starting manual cleanup of orphaned services...');

      const runningServices = await SystemctlUtils.getRunningServices();
      const dbSessions = await this.db.getActiveSessions();
      
      for (const serviceName of runningServices) {
        const sanitizedId = serviceName.replace('stream-', '').replace('.service', '');
        
        // Skip recovered sessions
        if (sanitizedId.startsWith('recovered-')) {
          logger.info(`Stopping orphaned recovered service: ${serviceName}`);
          await SystemctlUtils.stopService(serviceName);
          await SystemctlUtils.removeServiceFile(serviceName);
          continue;
        }
        
        // Check if service has corresponding database entry
        const sessionDb = dbSessions.find(s => s.sanitizedServiceId === sanitizedId);
        
        if (!sessionDb) {
          logger.info(`Stopping orphaned service: ${serviceName}`);
          await SystemctlUtils.stopService(serviceName);
          await SystemctlUtils.removeServiceFile(serviceName);
        }
      }

      logger.info('Manual cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup orphaned services:', error);
    } finally {
      this.recoveryInProgress = false;
    }
  }

  // Legacy compatibility methods (for scheduler)
  async readSessions() {
    try {
      const [activeSessions, inactiveSessions, scheduledSessions] = await Promise.all([
        this.getActiveSessions(),
        this.getInactiveSessions(),
        this.getScheduledSessions()
      ]);

      return {
        active_sessions: activeSessions,
        inactive_sessions: inactiveSessions,
        scheduled_sessions: scheduledSessions
      };
    } catch (error) {
      logger.error('Failed to read sessions:', error);
      return {
        active_sessions: [],
        inactive_sessions: [],
        scheduled_sessions: []
      };
    }
  }

  async writeSessions(data) {
    // This method is now a no-op since we're using database
    // Data is automatically persisted through individual operations
    return true;
  }
}

module.exports = new SessionData();