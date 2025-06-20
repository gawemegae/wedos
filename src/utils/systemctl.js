const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const config = require('../config/config');

class SystemctlUtils {
  static async createServiceFile(sessionName, videoPath, platformUrl, streamKey) {
    const sanitizedName = this.sanitizeServiceName(sessionName);
    const serviceName = `stream-${sanitizedName}.service`;
    
    // Use user systemd directory instead of system
    const userSystemdDir = path.join(process.env.HOME, '.config/systemd/user');
    await fs.ensureDir(userSystemdDir);
    
    const servicePath = path.join(userSystemdDir, serviceName);

    // Enhanced service configuration for stability
    const serviceContent = `[Unit]
Description=Streaming service for ${sessionName}
After=network.target

[Service]
# Enhanced FFmpeg command with stability options
ExecStart=${config.ffmpeg.path} \\
  -stream_loop -1 \\
  -re \\
  -i "${videoPath}" \\
  -c:v copy \\
  -c:a copy \\
  -f flv \\
  -flvflags no_duration_filesize \\
  -reconnect 1 \\
  -reconnect_at_eof 1 \\
  -reconnect_streamed 1 \\
  -reconnect_delay_max 5 \\
  -rw_timeout 30000000 \\
  -timeout 30000000 \\
  -fflags +genpts \\
  -avoid_negative_ts make_zero \\
  -max_muxing_queue_size 1024 \\
  "${platformUrl}/${streamKey}"

# Restart configuration for maximum stability
Restart=always
RestartSec=10
StartLimitInterval=0
StartLimitBurst=0

# Process management
Type=simple
TimeoutStartSec=60
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768

# Environment
Environment=FFREPORT=file=${config.paths.logs}/ffmpeg-${sanitizedName}-%t.log:level=32

[Install]
WantedBy=default.target
`;

    try {
      await fs.writeFile(servicePath, serviceContent);
      await this.userDaemonReload();
      logger.info(`Enhanced service file created: ${serviceName}`);
      return { serviceName, sanitizedId: sanitizedName };
    } catch (error) {
      logger.error(`Failed to create service file ${serviceName}:`, error);
      throw error;
    }
  }

  static async startService(serviceName) {
    return new Promise((resolve, reject) => {
      exec(`systemctl --user start ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to start service ${serviceName}:`, error);
          reject(error);
        } else {
          logger.info(`Service ${serviceName} started successfully`);
          resolve(stdout);
        }
      });
    });
  }

  static async stopService(serviceName) {
    return new Promise((resolve, reject) => {
      // First try graceful stop
      exec(`systemctl --user stop ${serviceName}`, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          logger.warn(`Graceful stop failed for ${serviceName}, trying force stop:`, error);
          
          // Force kill if graceful stop fails
          exec(`systemctl --user kill --signal=SIGKILL ${serviceName}`, (killError, killStdout, killStderr) => {
            if (killError) {
              logger.error(`Force stop also failed for ${serviceName}:`, killError);
            } else {
              logger.info(`Service ${serviceName} force stopped`);
            }
            resolve(stdout || killStdout);
          });
        } else {
          logger.info(`Service ${serviceName} stopped gracefully`);
          resolve(stdout);
        }
      });
    });
  }

  static async removeServiceFile(serviceName) {
    const userSystemdDir = path.join(process.env.HOME, '.config/systemd/user');
    const servicePath = path.join(userSystemdDir, serviceName);
    
    try {
      if (await fs.pathExists(servicePath)) {
        await fs.remove(servicePath);
        await this.userDaemonReload();
        logger.info(`Service file removed: ${serviceName}`);
      }
    } catch (error) {
      logger.error(`Failed to remove service file ${serviceName}:`, error);
    }
  }

  static async userDaemonReload() {
    return new Promise((resolve, reject) => {
      exec('systemctl --user daemon-reload', { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error('Failed to reload user systemd daemon:', error);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  static async getRunningServices() {
    return new Promise((resolve, reject) => {
      exec('systemctl --user list-units --type=service --state=running', (error, stdout, stderr) => {
        if (error) {
          logger.error('Failed to get running services:', error);
          reject(error);
        } else {
          const lines = stdout.split('\n');
          const streamServices = lines
            .filter(line => line.includes('stream-'))
            .map(line => line.split(/\s+/)[0]);
          resolve(streamServices);
        }
      });
    });
  }

  static async getServiceStatus(serviceName) {
    return new Promise((resolve) => {
      exec(`systemctl --user is-active ${serviceName}`, (error, stdout, stderr) => {
        const status = stdout.trim();
        resolve({
          isActive: status === 'active',
          status: status,
          serviceName: serviceName
        });
      });
    });
  }

  static async getServiceLogs(serviceName, lines = 50) {
    return new Promise((resolve, reject) => {
      exec(`journalctl --user -u ${serviceName} -n ${lines} --no-pager`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to get logs for ${serviceName}:`, error);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  static sanitizeServiceName(sessionName) {
    let sanitized = sessionName.replace(/[^\w-]/g, '-');
    sanitized = sanitized.replace(/-+/g, '-');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    return sanitized.substring(0, 50);
  }

  // Enable user lingering (allows user services to run without login)
  static async enableUserLingering() {
    return new Promise((resolve, reject) => {
      const username = process.env.USER;
      exec(`sudo loginctl enable-linger ${username}`, (error, stdout, stderr) => {
        if (error) {
          logger.warn('Failed to enable user lingering (may need manual setup):', error);
          resolve(false);
        } else {
          logger.info('User lingering enabled successfully');
          resolve(true);
        }
      });
    });
  }
}

module.exports = SystemctlUtils;