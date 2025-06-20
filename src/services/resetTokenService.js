const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/logger');
const database = require('./database');

class ResetTokenService {
  constructor() {
    this.db = database;
  }

  generateToken() {
    return {
      token: uuidv4().replace(/-/g, ''), // Remove hyphens for cleaner token
      shortToken: crypto.randomBytes(3).toString('hex').toUpperCase(), // 6 karakter untuk manual input
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + config.resetPassword.tokenExpiry)
    };
  }

  async createResetToken(email, username) {
    try {
      const now = new Date();
      
      // Find user
      const user = await this.db.findUserByEmail(email);
      if (!user) {
        throw new Error('User tidak ditemukan');
      }

      // Check rate limiting
      const recentAttempts = await this.db.getRecentResetAttempts(email, 1);
      
      if (recentAttempts.length >= config.resetPassword.maxAttempts) {
        throw new Error('Terlalu banyak percobaan reset password. Coba lagi dalam 1 jam.');
      }

      // Check cooldown period
      const lastAttempt = recentAttempts[recentAttempts.length - 1];
      if (lastAttempt && new Date(lastAttempt.createdAt) > new Date(now.getTime() - config.resetPassword.cooldownPeriod)) {
        const remainingTime = Math.ceil((config.resetPassword.cooldownPeriod - (now.getTime() - new Date(lastAttempt.createdAt).getTime())) / 60000);
        throw new Error(`Harap tunggu ${remainingTime} menit sebelum meminta reset password lagi.`);
      }

      // Remove existing tokens for this email
      await this.db.deleteTokensByEmail(email);

      // Generate new token
      const tokenData = this.generateToken();
      const resetToken = await this.db.createResetToken({
        token: tokenData.token,
        shortToken: tokenData.shortToken,
        email,
        username,
        expiresAt: tokenData.expiresAt,
        userId: user.id
      });

      // Record attempt
      await this.db.createResetAttempt({
        email,
        ipAddress: 'unknown', // Will be filled by controller
        userId: user.id
      });

      logger.info(`Reset token created for ${email}`);
      return {
        token: resetToken.token,
        shortToken: resetToken.shortToken,
        expiresAt: resetToken.expiresAt
      };
    } catch (error) {
      logger.error('Failed to create reset token:', error);
      throw error;
    }
  }

  async validateToken(token) {
    try {
      const resetToken = await this.db.findResetToken(token);

      if (!resetToken) {
        return { valid: false, error: 'Token reset password tidak valid atau sudah digunakan.' };
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return { valid: false, error: 'Token reset password sudah kadaluarsa. Silakan minta reset password baru.' };
      }

      return { 
        valid: true, 
        email: resetToken.email, 
        username: resetToken.username,
        token: resetToken.token 
      };
    } catch (error) {
      logger.error('Failed to validate reset token:', error);
      return { valid: false, error: 'Gagal memvalidasi token.' };
    }
  }

  async useToken(token) {
    try {
      const resetToken = await this.db.findResetToken(token);
      
      if (!resetToken) {
        throw new Error('Token tidak ditemukan atau sudah digunakan.');
      }

      // Mark token as used
      await this.db.markTokenAsUsed(resetToken.id);

      logger.info(`Reset token used: ${token.substring(0, 8)}...`);
      return true;
    } catch (error) {
      logger.error('Failed to use reset token:', error);
      throw error;
    }
  }

  async cleanupExpiredTokens() {
    try {
      const result = await this.db.deleteExpiredTokens();
      const oldAttempts = await this.db.deleteOldResetAttempts();
      
      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired reset tokens and ${oldAttempts.count} old attempts`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
    }
  }

  async getTokenStats() {
    try {
      // This would need custom queries to get stats from database
      // For now, return basic info
      return {
        message: 'Token stats available in database'
      };
    } catch (error) {
      logger.error('Failed to get token stats:', error);
      return null;
    }
  }
}

module.exports = new ResetTokenService();