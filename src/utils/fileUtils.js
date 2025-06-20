const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const lockfile = require('proper-lockfile');
const logger = require('./logger');

class FileUtils {
  static async ensureDir(dirPath) {
    try {
      await fs.ensureDir(dirPath);
      return true;
    } catch (error) {
      logger.error(`Failed to ensure directory ${dirPath}:`, error);
      return false;
    }
  }

  static async readJsonFile(filePath, defaultValue = {}) {
    try {
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data;
      } else {
        await this.writeJsonFile(filePath, defaultValue);
        return defaultValue;
      }
    } catch (error) {
      logger.error(`Failed to read JSON file ${filePath}:`, error);
      return defaultValue;
    }
  }

  static async writeJsonFile(filePath, data) {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, data, { spaces: 2 });
      return true;
    } catch (error) {
      logger.error(`Failed to write JSON file ${filePath}:`, error);
      return false;
    }
  }

  static async readJsonFileWithLock(filePath, defaultValue = {}) {
    const lockFilePath = `${filePath}.lock`;
    
    try {
      // Acquire lock
      const release = await lockfile.lock(filePath, {
        lockfilePath: lockFilePath,
        retries: 5,
        retryDelay: 100
      });

      try {
        const data = await this.readJsonFile(filePath, defaultValue);
        return data;
      } finally {
        await release();
      }
    } catch (error) {
      logger.error(`Failed to read JSON file with lock ${filePath}:`, error);
      return defaultValue;
    }
  }

  static async writeJsonFileWithLock(filePath, data) {
    const lockFilePath = `${filePath}.lock`;
    
    try {
      // Acquire lock
      const release = await lockfile.lock(filePath, {
        lockfilePath: lockFilePath,
        retries: 5,
        retryDelay: 100
      });

      try {
        const result = await this.writeJsonFile(filePath, data);
        return result;
      } finally {
        await release();
      }
    } catch (error) {
      logger.error(`Failed to write JSON file with lock ${filePath}:`, error);
      return false;
    }
  }

  static async getVideoFiles(videoDir) {
    try {
      const files = await fs.readdir(videoDir);
      const videoExtensions = ['.mp4', '.mkv', '.flv', '.avi', '.mov', '.webm'];
      
      return files.filter(file => 
        videoExtensions.some(ext => file.toLowerCase().endsWith(ext))
      ).sort();
    } catch (error) {
      logger.error(`Failed to get video files from ${videoDir}:`, error);
      return [];
    }
  }

  static async deleteFile(filePath) {
    try {
      await fs.remove(filePath);
      return true;
    } catch (error) {
      logger.error(`Failed to delete file ${filePath}:`, error);
      return false;
    }
  }

  static async renameFile(oldPath, newPath) {
    try {
      await fs.move(oldPath, newPath);
      return true;
    } catch (error) {
      logger.error(`Failed to rename file from ${oldPath} to ${newPath}:`, error);
      return false;
    }
  }

  static sanitizeForServiceName(sessionName) {
    // Sanitize session name for systemd service file
    let sanitized = sessionName.replace(/[^\w-]/g, '-');
    sanitized = sanitized.replace(/-+/g, '-');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    return sanitized.substring(0, 50);
  }

  static async getDiskUsage(dirPath) {
    try {
      // Use df command instead of fs.statvfs (which doesn't exist in Node.js)
      const dfOutput = execSync(`df -BG "${dirPath}"`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      
      if (lines.length < 2) {
        throw new Error('Invalid df output');
      }

      // Parse df output (skip header line)
      const dataLine = lines[1];
      const parts = dataLine.split(/\s+/);
      
      // df -BG output format: Filesystem 1G-blocks Used Available Use% Mounted
      const totalGB = parseInt(parts[1].replace('G', ''));
      const usedGB = parseInt(parts[2].replace('G', ''));
      const availableGB = parseInt(parts[3].replace('G', ''));
      const percentUsed = parseInt(parts[4].replace('%', ''));

      let status = 'normal';
      if (percentUsed > 95) status = 'full';
      else if (percentUsed > 80) status = 'almost_full';

      return {
        status,
        total: totalGB,
        used: usedGB,
        free: availableGB,
        percent_used: percentUsed
      };
    } catch (error) {
      logger.error(`Failed to get disk usage for ${dirPath}:`, error);
      
      // Fallback: try to get directory size
      try {
        const duOutput = execSync(`du -sh "${dirPath}"`, { encoding: 'utf8' });
        const sizeStr = duOutput.split('\t')[0];
        
        return {
          status: 'partial',
          total: 'unknown',
          used: sizeStr,
          free: 'unknown',
          percent_used: 0,
          message: `Directory size: ${sizeStr}`
        };
      } catch (fallbackError) {
        logger.error(`Fallback disk usage failed:`, fallbackError);
        
        return {
          status: 'error',
          total: 0,
          used: 0,
          free: 0,
          percent_used: 0,
          message: 'Unable to determine disk usage'
        };
      }
    }
  }

  static async pathExists(filePath) {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      return false;
    }
  }
}

module.exports = FileUtils;