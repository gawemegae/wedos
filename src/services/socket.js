const { Server } = require('socket.io');
const config = require('../config/config');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: config.cors.origin,
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Check if user is authenticated
      const session = socket.request.session;
      if (!session || !session.user) {
        logger.warn(`Unauthenticated client ${socket.id} disconnected`);
        socket.disconnect();
        return;
      }

      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      // Send initial data
      this.sendInitialData(socket);
    });

    // Share session middleware with Socket.IO
    const sessionMiddleware = require('../middleware/auth').sessionMiddleware;
    this.io.use((socket, next) => {
      sessionMiddleware(socket.request, {}, next);
    });

    logger.info('Socket.IO service initialized');
  }

  async sendInitialData(socket) {
    try {
      const sessionData = require('./sessionData');
      const FileUtils = require('../utils/fileUtils');

      // Send current data to newly connected client
      const videos = await FileUtils.getVideoFiles(config.paths.videos);
      const activeSessions = await sessionData.getActiveSessions();
      const inactiveSessions = await sessionData.getInactiveSessions();
      const schedules = await sessionData.getScheduledSessions();

      socket.emit('videos_update', videos);
      socket.emit('sessions_update', activeSessions);
      socket.emit('inactive_sessions_update', { inactive_sessions: inactiveSessions });
      socket.emit('schedules_update', schedules);

      // Send trial status
      if (config.trialMode.enabled) {
        socket.emit('trial_status_update', {
          is_trial: true,
          message: `Mode Trial Aktif, Live, Schedule Live dan Video akan terhapus tiap ${config.trialMode.resetHours} jam karena server Reset tiap ${config.trialMode.resetHours} jam`
        });
      } else {
        socket.emit('trial_status_update', { is_trial: false, message: '' });
      }
    } catch (error) {
      logger.error('Failed to send initial data to client:', error);
    }
  }

  emit(event, data) {
    if (this.io) {
      this.io.emit(event, data);
      logger.debug(`Emitted event: ${event}`);
    }
  }

  to(room) {
    if (this.io) {
      return this.io.to(room);
    }
    return null;
  }
}

module.exports = new SocketService();