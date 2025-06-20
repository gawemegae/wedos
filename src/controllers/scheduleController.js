const moment = require('moment-timezone');
const config = require('../config/config');
const logger = require('../utils/logger');
const sessionData = require('../services/sessionData');
const scheduler = require('../services/scheduler');
const socketService = require('../services/socket');

class ScheduleController {
  static async getSchedules(req, res) {
    try {
      const schedules = await sessionData.getScheduledSessions();
      res.json(schedules);
    } catch (error) {
      logger.error('Failed to get schedules:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to retrieve schedules' 
      });
    }
  }

  static async createSchedule(req, res) {
    const { 
      session_name_original, 
      video_file, 
      stream_key, 
      platform, 
      recurrence_type 
    } = req.body;

    if (!session_name_original || !video_file || !stream_key || !platform) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Nama sesi, platform, stream key, dan video file wajib diisi.' 
      });
    }

    if (!['YouTube', 'Facebook'].includes(platform)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Platform tidak valid.' 
      });
    }

    try {
      // Remove existing schedule if any
      await sessionData.removeScheduledSession(session_name_original);
      await sessionData.removeInactiveSession(session_name_original);

      const sanitizedServiceId = require('../utils/fileUtils').sanitizeForServiceName(session_name_original);
      
      let scheduleEntry = {
        session_name_original,
        sanitized_service_id: sanitizedServiceId,
        platform,
        stream_key,
        video_file,
        recurrence_type: recurrence_type || 'one_time'
      };

      let message = '';

      if (recurrence_type === 'daily') {
        const { start_time_of_day, stop_time_of_day } = req.body;

        if (!start_time_of_day || !stop_time_of_day) {
          return res.status(400).json({ 
            status: 'error', 
            message: "Untuk jadwal harian, 'start_time_of_day' dan 'stop_time_of_day' (format HH:MM) wajib diisi." 
          });
        }

        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(start_time_of_day) || !/^\d{2}:\d{2}$/.test(stop_time_of_day)) {
          return res.status(400).json({ 
            status: 'error', 
            message: 'Format waktu harian tidak valid. Gunakan HH:MM.' 
          });
        }

        scheduleEntry.id = `daily-${sanitizedServiceId}`;
        scheduleEntry.start_time_of_day = start_time_of_day;
        scheduleEntry.stop_time_of_day = stop_time_of_day;

        // Add to scheduler
        await scheduler.addDailySchedule(scheduleEntry);

        message = `Sesi harian '${session_name_original}' dijadwalkan setiap hari dari ${start_time_of_day} sampai ${stop_time_of_day}.`;

      } else if (recurrence_type === 'one_time') {
        const { start_time, duration } = req.body;

        if (!start_time) {
          return res.status(400).json({ 
            status: 'error', 
            message: "Untuk jadwal sekali jalan, 'start_time' (YYYY-MM-DDTHH:MM) wajib diisi." 
          });
        }

        const startDateTime = moment.tz(start_time, config.timezone);
        
        if (!startDateTime.isValid() || startDateTime.isBefore(moment().tz(config.timezone))) {
          return res.status(400).json({ 
            status: 'error', 
            message: 'Waktu mulai jadwal sekali jalan harus di masa depan dan format valid.' 
          });
        }

        const durationMinutes = Math.max(0, Math.floor((duration || 0) * 60));
        const isManualStop = durationMinutes === 0;

        scheduleEntry.id = `onetime-${sanitizedServiceId}`;
        scheduleEntry.start_time_iso = startDateTime.toISOString();
        scheduleEntry.duration_minutes = durationMinutes;
        scheduleEntry.is_manual_stop = isManualStop;

        // Add to scheduler
        await scheduler.addOneTimeSchedule(scheduleEntry);

        message = `Sesi "${session_name_original}" dijadwalkan sekali pada ${startDateTime.format('DD-MM-YYYY HH:mm:ss')}`;
        message += isManualStop ? ' hingga dihentikan manual.' : ` selama ${durationMinutes} menit.`;

      } else {
        return res.status(400).json({ 
          status: 'error', 
          message: `Tipe recurrence '${recurrence_type}' tidak dikenal.` 
        });
      }

      // Save schedule
      await sessionData.addScheduledSession(scheduleEntry);

      // Emit updates
      const schedules = await sessionData.getScheduledSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      
      socketService.emit('schedules_update', schedules);
      socketService.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });

      res.json({ 
        status: 'success', 
        message 
      });

    } catch (error) {
      logger.error('Create schedule error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server Internal: ' + error.message 
      });
    }
  }

  static async cancelSchedule(req, res) {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID definisi jadwal diperlukan.' 
      });
    }

    try {
      const scheduleToCancel = await sessionData.getScheduledSessionById(id);
      
      if (!scheduleToCancel) {
        return res.status(404).json({ 
          status: 'error', 
          message: `Definisi jadwal dengan ID '${id}' tidak ditemukan.` 
        });
      }

      // Remove from scheduler
      await scheduler.removeSchedule(scheduleToCancel);

      // Remove from data
      await sessionData.removeScheduledSessionById(id);

      // Emit update
      const schedules = await sessionData.getScheduledSessions();
      socketService.emit('schedules_update', schedules);

      res.json({ 
        status: 'success', 
        message: `Definisi jadwal '${scheduleToCancel.session_name_original}' dibatalkan.` 
      });

    } catch (error) {
      logger.error('Cancel schedule error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server Internal: ' + error.message 
      });
    }
  }
}

module.exports = ScheduleController;