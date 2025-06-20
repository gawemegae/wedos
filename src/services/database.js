const { PrismaClient } = require('@prisma/client');
const config = require('../config/config');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.prisma = new PrismaClient({
      log: config.env === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      errorFormat: 'pretty'
    });
  }

  async connect() {
    try {
      await this.prisma.$connect();
      logger.info('Database connected successfully');
      return true;
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      return false;
    }
  }

  async disconnect() {
    try {
      await this.prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // User operations
  async createUser(userData) {
    return await this.prisma.user.create({
      data: userData
    });
  }

  async findUserByUsername(username) {
    return await this.prisma.user.findUnique({
      where: { username }
    });
  }

  async findUserByEmail(email) {
    return await this.prisma.user.findUnique({
      where: { email }
    });
  }

  async findUserByUsernameOrEmail(identifier) {
    return await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier }
        ]
      }
    });
  }

  async updateUser(id, userData) {
    return await this.prisma.user.update({
      where: { id },
      data: userData
    });
  }

  async getUserCount() {
    return await this.prisma.user.count();
  }

  // Session operations
  async createSession(sessionData) {
    return await this.prisma.session.create({
      data: sessionData,
      include: { user: true }
    });
  }

  async getActiveSessions() {
    return await this.prisma.session.findMany({
      where: { status: 'active' },
      include: { user: true },
      orderBy: { startTime: 'desc' }
    });
  }

  async getInactiveSessions() {
    return await this.prisma.session.findMany({
      where: { status: 'inactive' },
      include: { user: true },
      orderBy: { stopTime: 'desc' }
    });
  }

  async getSessionById(id) {
    return await this.prisma.session.findUnique({
      where: { id },
      include: { user: true }
    });
  }

  async getSessionByName(sessionName) {
    return await this.prisma.session.findFirst({
      where: { sessionName },
      include: { user: true }
    });
  }

  async updateSession(id, sessionData) {
    return await this.prisma.session.update({
      where: { id },
      data: sessionData,
      include: { user: true }
    });
  }

  async deleteSession(id) {
    return await this.prisma.session.delete({
      where: { id }
    });
  }

  async deleteInactiveSessions() {
    return await this.prisma.session.deleteMany({
      where: { status: 'inactive' }
    });
  }

  // Schedule operations
  async createSchedule(scheduleData) {
    return await this.prisma.schedule.create({
      data: scheduleData
    });
  }

  async getActiveSchedules() {
    return await this.prisma.schedule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getScheduleById(id) {
    return await this.prisma.schedule.findUnique({
      where: { id }
    });
  }

  async getScheduleBySessionName(sessionName) {
    return await this.prisma.schedule.findFirst({
      where: { sessionNameOriginal: sessionName }
    });
  }

  async updateSchedule(id, scheduleData) {
    return await this.prisma.schedule.update({
      where: { id },
      data: scheduleData
    });
  }

  async deleteSchedule(id) {
    return await this.prisma.schedule.delete({
      where: { id }
    });
  }

  async deleteScheduleBySessionName(sessionName) {
    return await this.prisma.schedule.deleteMany({
      where: { sessionNameOriginal: sessionName }
    });
  }

  // Reset token operations
  async createResetToken(tokenData) {
    return await this.prisma.resetToken.create({
      data: tokenData,
      include: { user: true }
    });
  }

  async findResetToken(token) {
    return await this.prisma.resetToken.findFirst({
      where: {
        OR: [
          { token },
          { shortToken: token }
        ],
        used: false,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });
  }

  async markTokenAsUsed(id) {
    return await this.prisma.resetToken.update({
      where: { id },
      data: {
        used: true,
        usedAt: new Date()
      }
    });
  }

  async deleteExpiredTokens() {
    return await this.prisma.resetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true }
        ]
      }
    });
  }

  async deleteTokensByEmail(email) {
    return await this.prisma.resetToken.deleteMany({
      where: { email }
    });
  }

  // Reset attempt operations
  async createResetAttempt(attemptData) {
    return await this.prisma.resetAttempt.create({
      data: attemptData
    });
  }

  async getRecentResetAttempts(email, hours = 1) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await this.prisma.resetAttempt.findMany({
      where: {
        email,
        createdAt: { gte: since }
      }
    });
  }

  async deleteOldResetAttempts(days = 1) {
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await this.prisma.resetAttempt.deleteMany({
      where: {
        createdAt: { lt: before }
      }
    });
  }

  // Video file operations
  async createVideoFile(videoData) {
    return await this.prisma.videoFile.create({
      data: videoData
    });
  }

  async getVideoFiles() {
    return await this.prisma.videoFile.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async getVideoFileByFilename(filename) {
    return await this.prisma.videoFile.findUnique({
      where: { filename }
    });
  }

  async updateVideoFile(id, videoData) {
    return await this.prisma.videoFile.update({
      where: { id },
      data: videoData
    });
  }

  async deleteVideoFile(id) {
    return await this.prisma.videoFile.delete({
      where: { id }
    });
  }

  async deleteVideoFileByFilename(filename) {
    return await this.prisma.videoFile.deleteMany({
      where: { filename }
    });
  }

  // System log operations
  async createLog(logData) {
    return await this.prisma.systemLog.create({
      data: logData
    });
  }

  async getLogs(limit = 100, level = null) {
    const where = level ? { level } : {};
    return await this.prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async deleteOldLogs(days = 30) {
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await this.prisma.systemLog.deleteMany({
      where: {
        createdAt: { lt: before }
      }
    });
  }

  // App settings operations
  async getSetting(key) {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key }
    });
    
    if (!setting) return null;
    
    // Parse value based on type
    switch (setting.type) {
      case 'number':
        return parseFloat(setting.value);
      case 'boolean':
        return setting.value === 'true';
      case 'json':
        return JSON.parse(setting.value);
      default:
        return setting.value;
    }
  }

  async setSetting(key, value, type = 'string') {
    const stringValue = type === 'json' ? JSON.stringify(value) : String(value);
    
    return await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: stringValue, type },
      create: { key, value: stringValue, type }
    });
  }

  async getAllSettings() {
    const settings = await this.prisma.appSetting.findMany();
    const result = {};
    
    for (const setting of settings) {
      switch (setting.type) {
        case 'number':
          result[setting.key] = parseFloat(setting.value);
          break;
        case 'boolean':
          result[setting.key] = setting.value === 'true';
          break;
        case 'json':
          result[setting.key] = JSON.parse(setting.value);
          break;
        default:
          result[setting.key] = setting.value;
      }
    }
    
    return result;
  }

  // Cleanup operations
  async performCleanup() {
    try {
      // Delete expired reset tokens
      const expiredTokens = await this.deleteExpiredTokens();
      
      // Delete old reset attempts
      const oldAttempts = await this.deleteOldResetAttempts();
      
      // Delete old logs
      const oldLogs = await this.deleteOldLogs();
      
      logger.info('Database cleanup completed', {
        expiredTokens: expiredTokens.count,
        oldAttempts: oldAttempts.count,
        oldLogs: oldLogs.count
      });
      
      return {
        expiredTokens: expiredTokens.count,
        oldAttempts: oldAttempts.count,
        oldLogs: oldLogs.count
      };
    } catch (error) {
      logger.error('Database cleanup failed:', error);
      throw error;
    }
  }

  // Statistics
  async getStats() {
    const [
      userCount,
      activeSessionCount,
      inactiveSessionCount,
      scheduleCount,
      videoFileCount,
      logCount
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.session.count({ where: { status: 'active' } }),
      this.prisma.session.count({ where: { status: 'inactive' } }),
      this.prisma.schedule.count({ where: { isActive: true } }),
      this.prisma.videoFile.count(),
      this.prisma.systemLog.count()
    ]);

    return {
      users: userCount,
      activeSessions: activeSessionCount,
      inactiveSessions: inactiveSessionCount,
      schedules: scheduleCount,
      videoFiles: videoFileCount,
      logs: logCount,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new DatabaseService();