const { spawn } = require('child_process');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');
const FileUtils = require('../utils/fileUtils');
const socketService = require('../services/socket');

class VideoController {
  static async listVideos(req, res) {
    try {
      const videos = await FileUtils.getVideoFiles(config.paths.videos);
      res.json(videos);
    } catch (error) {
      logger.error('Failed to list videos:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Failed to retrieve video list' 
      });
    }
  }

  static async downloadVideo(req, res) {
    const { file_id } = req.body;

    if (!file_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ID/URL Video diperlukan' 
      });
    }

    try {
      const videoId = VideoController.extractDriveId(file_id);
      if (!videoId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Format ID/URL GDrive tidak valid atau tidak ditemukan.' 
        });
      }

      // Ensure video directory exists
      await FileUtils.ensureDir(config.paths.videos);

      const downloadUrl = `https://drive.google.com/uc?id=${videoId}&export=download`;
      const outputDir = config.paths.videos + path.sep;

      const gdownProcess = spawn(config.gdown.path, [
        downloadUrl,
        '-O', outputDir,
        '--no-cookies',
        '--quiet',
        '--continue'
      ]);

      let stderr = '';
      let stdout = '';

      gdownProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      gdownProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gdownProcess.on('close', async (code) => {
        if (code === 0) {
          logger.info(`Video download completed for ID: ${videoId}`);
          
          // Emit video list update
          const videos = await FileUtils.getVideoFiles(config.paths.videos);
          socketService.emit('videos_update', videos);
          
          res.json({ 
            status: 'success', 
            message: 'Download video berhasil. Cek daftar video.' 
          });
        } else {
          logger.error(`Gdown error (code ${code}): ${stderr}`);
          let errorMessage = 'Download Gagal: ' + stderr.substring(0, 250);
          
          if (stderr.includes('Permission denied') || stderr.includes('Zugriff verweigert')) {
            errorMessage = 'Download Gagal: Pastikan file publik atau Anda punya izin.';
          } else if (stderr.includes('File not found') || stderr.includes('No such file')) {
            errorMessage = 'Download Gagal: File tidak ditemukan atau tidak dapat diakses.';
          }
          
          res.status(500).json({ 
            status: 'error', 
            message: errorMessage 
          });
        }
      });

      gdownProcess.on('error', (error) => {
        logger.error('Gdown process error:', error);
        res.status(500).json({ 
          status: 'error', 
          message: 'Gagal memulai proses download' 
        });
      });

    } catch (error) {
      logger.error('Download video error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async renameVideo(req, res) {
    const { old_name, new_name } = req.body;

    if (!old_name || !new_name) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Nama lama & baru diperlukan' 
      });
    }

    if (!/^[\w\-. ]+$/.test(new_name)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Nama baru tidak valid (hanya huruf, angka, spasi, titik, strip, underscore).' 
      });
    }

    try {
      const oldPath = path.join(config.paths.videos, old_name);
      const extension = path.extname(old_name);
      const newPath = path.join(config.paths.videos, new_name.trim() + extension);

      if (oldPath === newPath) {
        return res.json({ 
          status: 'success', 
          message: 'Nama video tidak berubah.' 
        });
      }

      if (await FileUtils.pathExists(newPath)) {
        return res.status(400).json({ 
          status: 'error', 
          message: `Nama "${path.basename(newPath)}" sudah ada.` 
        });
      }

      const success = await FileUtils.renameFile(oldPath, newPath);
      if (success) {
        // Emit video list update
        const videos = await FileUtils.getVideoFiles(config.paths.videos);
        socketService.emit('videos_update', videos);
        
        res.json({ 
          status: 'success', 
          message: `Video diubah ke "${path.basename(newPath)}"` 
        });
      } else {
        res.status(500).json({ 
          status: 'error', 
          message: 'Gagal mengubah nama video' 
        });
      }
    } catch (error) {
      logger.error('Rename video error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async deleteVideo(req, res) {
    const { file_name } = req.body;

    if (!file_name) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Nama file diperlukan' 
      });
    }

    try {
      const filePath = path.join(config.paths.videos, file_name);
      const success = await FileUtils.deleteFile(filePath);
      
      if (success) {
        // Emit video list update
        const videos = await FileUtils.getVideoFiles(config.paths.videos);
        socketService.emit('videos_update', videos);
        
        res.json({ 
          status: 'success', 
          message: `Video "${file_name}" dihapus` 
        });
      } else {
        res.status(500).json({ 
          status: 'error', 
          message: 'Gagal menghapus video' 
        });
      }
    } catch (error) {
      logger.error('Delete video error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async deleteAllVideos(req, res) {
    try {
      const videos = await FileUtils.getVideoFiles(config.paths.videos);
      let count = 0;

      for (const video of videos) {
        const filePath = path.join(config.paths.videos, video);
        const success = await FileUtils.deleteFile(filePath);
        if (success) count++;
      }

      // Emit video list update
      const remainingVideos = await FileUtils.getVideoFiles(config.paths.videos);
      socketService.emit('videos_update', remainingVideos);

      res.json({ 
        status: 'success', 
        message: `Berhasil menghapus ${count} video.`,
        deleted_count: count 
      });
    } catch (error) {
      logger.error('Delete all videos error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static async getDiskUsage(req, res) {
    try {
      const diskUsage = await FileUtils.getDiskUsage(config.paths.videos);
      res.json(diskUsage);
    } catch (error) {
      logger.error('Get disk usage error:', error);
      res.status(500).json({ 
        status: 'error', 
        message: 'Kesalahan Server: ' + error.message 
      });
    }
  }

  static extractDriveId(input) {
    if (!input) return null;
    
    if (input.includes('drive.google.com')) {
      const match = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                   input.match(/id=([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
      
      const parts = input.split('/');
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.length > 20 && !part.includes('.') && !part.includes('=')) {
          return part;
        }
      }
    }
    
    return /^[a-zA-Z0-9_-]{20,}$/.test(input) ? input : null;
  }
}

module.exports = VideoController;