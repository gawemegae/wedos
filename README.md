# StreamHib Node.js - Advanced Video Streaming Management

StreamHib adalah aplikasi web untuk mengelola sesi streaming video ke platform seperti YouTube dan Facebook. Versi Node.js ini menggunakan database SQLite dengan Prisma ORM untuk performa dan reliabilitas yang lebih baik.

## 🌟 Features

- 📹 **Video Management** - Upload, rename, delete video files
- 🔴 **Live Streaming** - Stream langsung ke YouTube dan Facebook  
- ⏰ **Scheduled Streaming** - Jadwal streaming (sekali jalan dan harian)
- 🗄️ **SQLite Database** - Database robust dengan Prisma ORM
- 📧 **Email Notifications** - Welcome email dan reset password
- 🔐 **Authentication** - Login dengan username/email + forgot password
- 🌐 **Multi-language** - Support ID/EN
- 📊 **Real-time Dashboard** - Monitor streaming dengan Socket.IO
- 🛡️ **Security** - Rate limiting, session management, CSRF protection
- 🔄 **Trial Mode** - Auto-reset untuk demo/testing

## 🚀 Quick Installation (Ubuntu 22.04)

### **Metode 1: Auto Install Script**
```bash
# Download dan jalankan script instalasi
wget https://raw.githubusercontent.com/gawemegae/streamhibnodejs/main/scripts/install-ubuntu.sh
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

### **Metode 2: Manual Installation**
```bash
# Clone repository
git clone https://github.com/gawemegae/streamhibnodejs.git
cd streamhibnodejs

# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma db push
npm run db:seed

# Configure environment
cp .env.example .env
nano .env

# Start application
npm start
```

## 📋 Requirements

- **Node.js** 18+ LTS
- **FFmpeg** untuk video processing
- **Python 3** + gdown untuk Google Drive downloads
- **SQLite** (included)
- **systemd** untuk service management (Linux)
- **Ubuntu 22.04** LTS (recommended)

## 🔧 Configuration

Edit file `.env`:

```bash
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://your-domain.com:5000

# Database
DATABASE_URL="file:./data/streamhib.db"

# Email Configuration (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-digit-app-password

# Trial Mode
TRIAL_MODE_ENABLED=false
TRIAL_RESET_HOURS=24

# Paths
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown
```

## 📊 Database Schema

### **Tables:**
- `users` - User accounts dengan email
- `sessions` - Active/inactive streaming sessions  
- `schedules` - Scheduled streaming (one-time & daily)
- `reset_tokens` - Password reset tokens
- `reset_attempts` - Rate limiting untuk reset
- `video_files` - Video file metadata
- `system_logs` - Application logs

### **Database Commands:**
```bash
# Generate Prisma client
npx prisma generate

# Create/update database
npx prisma db push

# View database
npx prisma studio

# Reset database
rm data/streamhib.db
npx prisma db push
npm run db:seed
```

## 🌐 Production Setup

### **1. Systemd Service**
```bash
# Create service
sudo nano /etc/systemd/system/streamhib.service

# Enable dan start
sudo systemctl enable streamhib
sudo systemctl start streamhib

# Check status
sudo systemctl status streamhib
```

### **2. Nginx Reverse Proxy**
```bash
# Run setup script
./scripts/setup-nginx.sh

# Manual setup
sudo apt install nginx
sudo nano /etc/nginx/sites-available/streamhib
sudo ln -s /etc/nginx/sites-available/streamhib /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### **3. SSL Certificate**
```bash
# Install Let's Encrypt
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com
```

## 📧 Email Setup (Gmail)

1. **Enable 2-Factor Authentication** di Gmail
2. **Generate App Password**:
   - Buka [Google Account Security](https://myaccount.google.com/security)
   - Pilih "2-Step Verification" → "App passwords"
   - Pilih "Mail" dan "Other (Custom name)"
   - Masukkan "StreamHib"
   - Copy 16-digit password
3. **Update .env** dengan app password

## 🛠️ Development

```bash
# Development mode dengan auto-restart
npm run dev

# Database development
npx prisma studio

# View logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Test email
node -e "
const emailService = require('./src/services/emailService');
emailService.testConnection().then(console.log);
"
```

## 📊 Monitoring & Maintenance

### **System Monitor:**
```bash
# Run monitoring script
~/monitor-streamhib.sh

# Manual checks
sudo systemctl status streamhib
sudo journalctl -u streamhib -f
htop
df -h
```

### **Backup & Restore:**
```bash
# Run backup script
~/backup-streamhib.sh

# Manual backup
cp data/streamhib.db backup/streamhib-$(date +%Y%m%d).db
tar -czf backup/videos-$(date +%Y%m%d).tar.gz videos/
```

### **Update Application:**
```bash
# Stop service
sudo systemctl stop streamhib

# Backup database
cp data/streamhib.db backup/

# Update code
git pull origin main
npm install
npx prisma db push

# Start service
sudo systemctl start streamhib
```

## 🔍 Troubleshooting

### **Service Issues:**
```bash
# Check logs
sudo journalctl -u streamhib -n 50

# Check database
npx prisma studio

# Reset database
rm data/streamhib.db
npx prisma db push
npm run db:seed
```

### **Email Issues:**
```bash
# Test email connection
node -e "
const emailService = require('./src/services/emailService');
emailService.testConnection().then(result => {
  console.log('Email test:', result ? 'SUCCESS' : 'FAILED');
});
"
```

### **FFmpeg Issues:**
```bash
# Test FFmpeg
ffmpeg -version
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 -f null -
```

### **Port Issues:**
```bash
# Check port usage
sudo netstat -tlnp | grep :5000
sudo lsof -i :5000

# Kill process
sudo kill -9 PID
```

## 📚 Documentation

- **Installation Guide**: [INSTALLATION-UBUNTU.md](INSTALLATION-UBUNTU.md)
- **API Documentation**: `/docs` (when running)
- **Database Schema**: `prisma/schema.prisma`
- **Configuration**: `.env.example`

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Repository**: https://github.com/gawemegae/streamhibnodejs
- **Issues**: https://github.com/gawemegae/streamhibnodejs/issues
- **Wiki**: https://github.com/gawemegae/streamhibnodejs/wiki

## 🎯 First Run

1. **Access Application**: `http://your-server-ip:5000`
2. **Register Admin**: Klik "Daftar di sini"
3. **Configure Email**: Edit `.env` file
4. **Upload Video**: Test dengan video sample
5. **Start Streaming**: Buat sesi streaming baru

---

**StreamHib Node.js** - Professional video streaming management solution with robust database backend! 🚀