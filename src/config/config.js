const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  
  server: {
    port: process.env.PORT || 5000,
    host: process.env.HOST || '0.0.0.0',
    baseUrl: process.env.BASE_URL || 'http://localhost:5000'
  },
  
  session: {
    secret: process.env.SESSION_SECRET || 'emuhib-secret-key',
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 12 * 60 * 60 * 1000
    }
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5000',
    credentials: true
  },
  
  // Konfigurasi Email - DISABLED
  email: {
    enabled: false, // DISABLE EMAIL SERVICE
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@streamhib.com'
  },
  
  // Konfigurasi Reset Password
  resetPassword: {
    tokenExpiry: 60 * 60 * 1000, // 1 jam dalam milidetik
    maxAttempts: 5, // Maksimal 5 percobaan reset per jam
    cooldownPeriod: 15 * 60 * 1000 // 15 menit cooldown antar permintaan
  },
  
  paths: {
    root: path.resolve(__dirname, '../..'),
    sessions: process.env.SESSIONS_FILE || path.resolve(__dirname, '../../data/sessions.json'),
    users: process.env.USERS_FILE || path.resolve(__dirname, '../../data/users.json'),
    resetTokens: process.env.RESET_TOKENS_FILE || path.resolve(__dirname, '../../data/reset_tokens.json'),
    videos: process.env.VIDEO_DIR || path.resolve(__dirname, '../../videos'),
    logs: process.env.LOGS_DIR || path.resolve(__dirname, '../../logs'),
    systemd: '/etc/systemd/system'
  },
  
  trialMode: {
    enabled: process.env.TRIAL_MODE_ENABLED === 'true' || false,
    resetHours: parseInt(process.env.TRIAL_RESET_HOURS) || 2
  },
  
  timezone: 'Asia/Jakarta',
  
  ffmpeg: {
    path: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg'
  },
  
  platforms: {
    YouTube: 'rtmp://a.rtmp.youtube.com/live2',
    Facebook: 'rtmps://live-api-s.facebook.com:443/rtmp'
  },
  
  gdown: {
    path: process.env.GDOWN_PATH || '/usr/local/bin/gdown'
  }
};

module.exports = config;