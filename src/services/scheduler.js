const cron = require('node-cron');
const moment = require('moment-timezone');
const config = require('../config/config');
const logger = require('../utils/logger');
const sessionData = require('./sessionData');
const sessionManager = require('./sessionManager');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) {
      logger.warn('Scheduler already initialized, skipping...');
      return;
    }

    logger.info('Initializing Scheduler...');
    
    try {
      // Recover existing schedules
      await this.recoverSchedules();
      
      // Setup cleanup job for expired schedules
      this.setupCleanupJob();
      
      this.isInitialized = true;
      logger.info('Scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  setupCleanupJob() {
    // Clean up expired one-time schedules every hour
    const cleanupJob = cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredSchedules();
    }, {
      scheduled: true,
      timezone: config.timezone
    });

    this.jobs.set('cleanup-expired-schedules', cleanupJob);
    logger.info('Cleanup job for expired schedules scheduled');
  }

  async cleanupExpiredSchedules() {
    try {
      logger.info('Cleaning up expired one-time schedules...');
      
      const schedules = await sessionData.getScheduledSessions();
      const now = moment().tz(config.timezone);
      let cleanedCount = 0;

      for (const schedule of schedules) {
        if (schedule.recurrence_type === 'one_time' && schedule.start_time_iso) {
          const startTime = moment(schedule.start_time_iso).tz(config.timezone);
          const duration = schedule.duration_minutes || 0;
          const endTime = startTime.clone().add(Math.max(duration, 60), 'minutes'); // At least 1 hour buffer

          if (now.isAfter(endTime)) {
            logger.info(`Removing expired one-time schedule: ${schedule.session_name_original}`);
            await this.removeSchedule(schedule);
            await sessionData.removeScheduledSessionById(schedule.id);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired schedules`);
        
        // Emit update to frontend
        const updatedSchedules = await sessionData.getScheduledSessions();
        const socketService = require('./socket');
        socketService.emit('schedules_update', updatedSchedules);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired schedules:', error);
    }
  }

  async recoverSchedules() {
    const data = await sessionData.readSessions();
    const now = moment().tz(config.timezone);
    const validSchedules = [];

    logger.info('Recovering schedules...');

    for (const schedule of data.scheduled_sessions) {
      try {
        const sessionName = schedule.session_name_original;
        const sanitizedId = schedule.sanitized_service_id;
        const { platform, stream_key, video_file, recurrence_type } = schedule;

        if (!sessionName || !sanitizedId || !platform || !stream_key || !video_file) {
          logger.warn(`Skipping incomplete schedule: ${sessionName}`);
          continue;
        }

        if (recurrence_type === 'daily') {
          const { start_time_of_day, stop_time_of_day } = schedule;
          
          if (!start_time_of_day || !stop_time_of_day) {
            logger.warn(`Skipping daily schedule with missing times: ${sessionName}`);
            continue;
          }

          // Validate time format
          if (!this.isValidTimeFormat(start_time_of_day) || !this.isValidTimeFormat(stop_time_of_day)) {
            logger.warn(`Skipping daily schedule with invalid time format: ${sessionName}`);
            continue;
          }

          await this.addDailySchedule(schedule);
          validSchedules.push(schedule);
          
        } else if (recurrence_type === 'one_time') {
          const { start_time_iso, duration_minutes, is_manual_stop } = schedule;
          
          if (!start_time_iso) {
            logger.warn(`Skipping one-time schedule with missing start time: ${sessionName}`);
            continue;
          }

          const startTime = moment(start_time_iso).tz(config.timezone);
          
          if (!startTime.isValid()) {
            logger.warn(`Skipping one-time schedule with invalid start time: ${sessionName}`);
            continue;
          }

          // Only recover future schedules
          if (startTime.isAfter(now)) {
            await this.addOneTimeSchedule(schedule);
            validSchedules.push(schedule);
          } else {
            logger.info(`Skipping past one-time schedule: ${sessionName} (${startTime.format()})`);
          }
        }
      } catch (error) {
        logger.error(`Failed to recover schedule ${schedule.session_name_original}:`, error);
      }
    }

    // Update with valid schedules only
    if (validSchedules.length !== data.scheduled_sessions.length) {
      data.scheduled_sessions = validSchedules;
      await sessionData.writeSessions(data);
      logger.info('Updated sessions.json with valid schedules after recovery');
    }

    logger.info(`Schedule recovery completed: ${validSchedules.length} valid schedules recovered`);
  }

  isValidTimeFormat(timeString) {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString);
  }

  async addDailySchedule(schedule) {
    const { session_name_original, sanitized_service_id, platform, stream_key, video_file,
            start_time_of_day, stop_time_of_day } = schedule;

    const [startH, startM] = start_time_of_day.split(':').map(Number);
    const [stopH, stopM] = stop_time_of_day.split(':').map(Number);

    // Validate time values
    if (startH < 0 || startH > 23 || startM < 0 || startM > 59 ||
        stopH < 0 || stopH > 23 || stopM < 0 || stopM > 59) {
      throw new Error(`Invalid time values for daily schedule: ${session_name_original}`);
    }

    const startJobId = `daily-start-${sanitized_service_id}`;
    const stopJobId = `daily-stop-${sanitized_service_id}`;

    // Remove existing jobs
    this.removeJob(startJobId);
    this.removeJob(stopJobId);

    try {
      // Add start job
      const startJob = cron.schedule(`${startM} ${startH} * * *`, async () => {
        logger.info(`Daily schedule triggered: Starting ${session_name_original}`);
        await sessionManager.startScheduledStreaming(
          platform, stream_key, video_file, session_name_original,
          0, 'daily', start_time_of_day, stop_time_of_day
        );
      }, {
        scheduled: true,
        timezone: config.timezone
      });

      // Add stop job
      const stopJob = cron.schedule(`${stopM} ${stopH} * * *`, async () => {
        logger.info(`Daily schedule triggered: Stopping ${session_name_original}`);
        await sessionManager.stopScheduledStreaming(session_name_original);
      }, {
        scheduled: true,
        timezone: config.timezone
      });

      this.jobs.set(startJobId, startJob);
      this.jobs.set(stopJobId, stopJob);

      logger.info(`Added daily schedule for '${session_name_original}': ${start_time_of_day} - ${stop_time_of_day}`);
    } catch (error) {
      logger.error(`Failed to add daily schedule for '${session_name_original}':`, error);
      throw error;
    }
  }

  async addOneTimeSchedule(schedule) {
    const { session_name_original, sanitized_service_id, platform, stream_key, video_file,
            start_time_iso, duration_minutes, is_manual_stop } = schedule;

    const startTime = moment(start_time_iso).tz(config.timezone);
    const startJobId = schedule.id; // Use schedule ID as job ID

    if (!startTime.isValid()) {
      throw new Error(`Invalid start time for one-time schedule: ${session_name_original}`);
    }

    // Remove existing job
    this.removeJob(startJobId);

    try {
      // Add start job
      const startJob = cron.schedule(this.momentToCron(startTime), async () => {
        logger.info(`One-time schedule triggered: Starting ${session_name_original}`);
        await sessionManager.startScheduledStreaming(
          platform, stream_key, video_file, session_name_original,
          duration_minutes, 'one_time'
        );
        
        // Remove the job after execution
        this.removeJob(startJobId);
      }, {
        scheduled: true,
        timezone: config.timezone
      });

      this.jobs.set(startJobId, startJob);

      // Add stop job if not manual stop
      if (!is_manual_stop && duration_minutes > 0) {
        const stopTime = startTime.clone().add(duration_minutes, 'minutes');
        const stopJobId = `onetime-stop-${sanitized_service_id}`;

        this.removeJob(stopJobId);

        const stopJob = cron.schedule(this.momentToCron(stopTime), async () => {
          logger.info(`One-time schedule triggered: Auto-stopping ${session_name_original}`);
          await sessionManager.stopScheduledStreaming(session_name_original);
          this.removeJob(stopJobId);
        }, {
          scheduled: true,
          timezone: config.timezone
        });

        this.jobs.set(stopJobId, stopJob);
        
        logger.info(`Added one-time schedule for '${session_name_original}': ${startTime.format()} (${duration_minutes}min)`);
      } else {
        logger.info(`Added one-time schedule for '${session_name_original}': ${startTime.format()} (manual stop)`);
      }
    } catch (error) {
      logger.error(`Failed to add one-time schedule for '${session_name_original}':`, error);
      throw error;
    }
  }

  async removeSchedule(schedule) {
    const { sanitized_service_id, recurrence_type, id } = schedule;

    try {
      if (recurrence_type === 'daily') {
        this.removeJob(`daily-start-${sanitized_service_id}`);
        this.removeJob(`daily-stop-${sanitized_service_id}`);
      } else if (recurrence_type === 'one_time') {
        this.removeJob(id); // Start job
        this.removeJob(`onetime-stop-${sanitized_service_id}`); // Stop job
      }

      logger.info(`Removed schedule jobs for '${schedule.session_name_original}'`);
    } catch (error) {
      logger.error(`Failed to remove schedule for '${schedule.session_name_original}':`, error);
    }
  }

  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      try {
        job.destroy();
        this.jobs.delete(jobId);
        logger.debug(`Removed job: ${jobId}`);
      } catch (error) {
        logger.error(`Failed to remove job ${jobId}:`, error);
      }
    }
  }

  momentToCron(momentObj) {
    // Convert moment to cron format: "minute hour day month dayOfWeek"
    return `${momentObj.minute()} ${momentObj.hour()} ${momentObj.date()} ${momentObj.month() + 1} *`;
  }

  getActiveJobs() {
    return Array.from(this.jobs.keys());
  }

  getJobsStatus() {
    const jobs = [];
    for (const [jobId, job] of this.jobs.entries()) {
      jobs.push({
        id: jobId,
        running: job.running || false,
        scheduled: true
      });
    }
    return jobs;
  }

  destroy() {
    logger.info('Destroying scheduler...');
    
    for (const [jobId, job] of this.jobs.entries()) {
      try {
        job.destroy();
      } catch (error) {
        logger.error(`Failed to destroy job ${jobId}:`, error);
      }
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    logger.info('Scheduler destroyed');
  }
}

module.exports = new Scheduler();