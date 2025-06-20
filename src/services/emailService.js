const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.enabled = config.email.enabled || false;
    
    if (this.enabled) {
      this.init();
    } else {
      logger.info('Email service DISABLED in configuration');
    }
  }

  init() {
    try {
      // Konfigurasi email transporter
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.password
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      logger.info('Email service initialized');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
    }
  }

  async sendPasswordResetEmail(email, username, resetToken, resetUrl) {
    if (!this.enabled) {
      logger.info(`Email service disabled - Password reset email SKIPPED for ${email}`);
      logger.info(`Reset token for ${username}: ${resetToken}`);
      logger.info(`Reset URL: ${resetUrl}`);
      return { success: true, messageId: 'disabled' };
    }

    try {
      const mailOptions = {
        from: `"StreamHib" <${config.email.from}>`,
        to: email,
        subject: 'Reset Password StreamHib',
        html: this.getPasswordResetTemplate(username, resetUrl, resetToken)
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Password reset email sent to ${email}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`Failed to send password reset email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(email, username) {
    if (!this.enabled) {
      logger.info(`Email service disabled - Welcome email SKIPPED for ${email}`);
      return { success: true, messageId: 'disabled' };
    }

    try {
      const mailOptions = {
        from: `"StreamHib" <${config.email.from}>`,
        to: email,
        subject: 'Selamat Datang di StreamHib',
        html: this.getWelcomeTemplate(username)
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Welcome email sent to ${email}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`Failed to send welcome email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  getPasswordResetTemplate(username, resetUrl, token) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password StreamHib</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4299e1, #667eea); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #4299e1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background: #3182ce; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .token-box { background: #e2e8f0; padding: 15px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔐 Reset Password StreamHib</h1>
        </div>
        <div class="content">
            <h2>Halo ${username}!</h2>
            <p>Kami menerima permintaan untuk mereset password akun StreamHib Anda.</p>
            
            <p><strong>Klik tombol di bawah untuk mereset password:</strong></p>
            <a href="${resetUrl}" class="button">Reset Password Sekarang</a>
            
            <div class="warning">
                <strong>⚠️ Penting:</strong>
                <ul>
                    <li>Link ini hanya berlaku selama <strong>1 jam</strong></li>
                    <li>Jika Anda tidak meminta reset password, abaikan email ini</li>
                    <li>Jangan bagikan link ini kepada siapa pun</li>
                </ul>
            </div>
            
            <p>Jika tombol di atas tidak berfungsi, copy dan paste URL berikut ke browser:</p>
            <div class="token-box">${resetUrl}</div>
            
            <p>Atau gunakan token reset manual: <code>${token}</code></p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p><strong>Informasi Keamanan:</strong></p>
            <ul>
                <li>Waktu permintaan: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</li>
                <li>IP Address: [Akan ditampilkan di log server]</li>
            </ul>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem StreamHib.<br>
            Jika ada pertanyaan, hubungi administrator sistem.</p>
        </div>
    </body>
    </html>
    `;
  }

  getWelcomeTemplate(username) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Selamat Datang di StreamHib</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #48bb78, #4299e1); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #4299e1; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🎉 Selamat Datang di StreamHib!</h1>
        </div>
        <div class="content">
            <h2>Halo ${username}!</h2>
            <p>Terima kasih telah bergabung dengan StreamHib. Akun Anda telah berhasil dibuat!</p>
            
            <h3>🚀 Fitur yang Tersedia:</h3>
            <div class="feature">
                <strong>📹 Manajemen Video</strong><br>
                Upload dan kelola video untuk streaming
            </div>
            <div class="feature">
                <strong>🔴 Live Streaming</strong><br>
                Stream langsung ke YouTube dan Facebook
            </div>
            <div class="feature">
                <strong>⏰ Penjadwalan</strong><br>
                Jadwalkan streaming otomatis (sekali jalan atau harian)
            </div>
            <div class="feature">
                <strong>📊 Dashboard</strong><br>
                Monitor semua aktivitas streaming Anda
            </div>
            
            <p><strong>Mulai streaming sekarang!</strong> Login ke akun Anda dan jelajahi semua fitur yang tersedia.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p><strong>Tips Keamanan:</strong></p>
            <ul>
                <li>Jangan bagikan password Anda kepada siapa pun</li>
                <li>Gunakan password yang kuat dan unik</li>
                <li>Logout setelah selesai menggunakan aplikasi</li>
            </ul>
        </div>
        <div class="footer">
            <p>Email ini dikirim otomatis oleh sistem StreamHib.<br>
            Selamat streaming! 🎬</p>
        </div>
    </body>
    </html>
    `;
  }

  async testConnection() {
    if (!this.enabled) {
      logger.info('Email service is disabled - test skipped');
      return true; // Return true so app doesn't fail
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection verified successfully');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();