# StreamHib Node.js - Panduan Instalasi Lengkap

## 🖥️ **Rekomendasi Server**

### **Pilihan Terbaik: Ubuntu Server 22.04 LTS**
- ✅ **Paling Stabil** untuk aplikasi Node.js
- ✅ **Long Term Support** hingga 2027
- ✅ **Package manager** yang mudah (apt)
- ✅ **Dokumentasi lengkap** dan community support
- ✅ **Systemd** built-in untuk service management

### **Alternatif Lain:**
- **Debian 12** - Lebih ringan, cocok untuk VPS kecil
- **CentOS Stream 9** - Untuk enterprise environment
- **Rocky Linux 9** - Alternative CentOS yang stabil

### **Spesifikasi Minimum:**
- **RAM**: 2GB (4GB recommended)
- **Storage**: 20GB (50GB+ untuk video storage)
- **CPU**: 2 cores (4 cores recommended)
- **Network**: 100Mbps+ untuk streaming

---

## 🚀 **Instalasi Step by Step**

### **Step 1: Persiapan Server Ubuntu 22.04**

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install dependencies dasar
sudo apt install -y curl wget git nano htop unzip software-properties-common

# Install build tools
sudo apt install -y build-essential python3-pip

# Reboot jika ada kernel update
sudo reboot
```

### **Step 2: Install Node.js 18+ (LTS)**

```bash
# Install Node.js via NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 untuk production
sudo npm install -g pm2
```

### **Step 3: Install FFmpeg**

```bash
# Install FFmpeg dari repository
sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version

# Test FFmpeg
ffmpeg -f lavfi -i testsrc=duration=10:size=320x240:rate=1 -f null -
```

### **Step 4: Install Python & gdown**

```bash
# Install Python dan pip
sudo apt install -y python3 python3-pip

# Install gdown untuk Google Drive download
sudo pip3 install gdown

# Verify installation
gdown --version
which gdown  # Should show /usr/local/bin/gdown
```

### **Step 5: Setup User & Directories**

```bash
# Buat user khusus untuk StreamHib (optional tapi recommended)
sudo useradd -m -s /bin/bash streamhib
sudo usermod -aG sudo streamhib

# Atau gunakan user existing
# Switch ke user streamhib
sudo su - streamhib

# Buat direktori kerja
mkdir -p ~/streamhib
cd ~/streamhib
```

### **Step 6: Clone & Setup StreamHib**

```bash
# Clone repository (atau upload file manual)
git clone https://github.com/your-repo/StreamHib-NodeJS.git
# Atau upload file zip dan extract

cd StreamHib-NodeJS

# Install dependencies
npm install

# Buat direktori yang diperlukan
mkdir -p data videos logs

# Set permissions
chmod 755 data videos logs
```

### **Step 7: Konfigurasi Environment**

```bash
# Buat file environment
nano .env
```

**Isi file `.env`:**
```bash
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://your-domain.com:5000

# Session Secret (ganti dengan random string)
SESSION_SECRET=your-super-secret-key-here-change-this

# Email Configuration (Gmail recommended)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-digit-app-password
EMAIL_FROM=StreamHib <your-email@gmail.com>

# Trial Mode (set false untuk production)
TRIAL_MODE_ENABLED=false
TRIAL_RESET_HOURS=24

# File Paths (default sudah OK)
SESSIONS_FILE=/home/streamhib/streamhib/StreamHib-NodeJS/data/sessions.json
USERS_FILE=/home/streamhib/streamhib/StreamHib-NodeJS/data/users.json
RESET_TOKENS_FILE=/home/streamhib/streamhib/StreamHib-NodeJS/data/reset_tokens.json
VIDEO_DIR=/home/streamhib/streamhib/StreamHib-NodeJS/videos
LOGS_DIR=/home/streamhib/streamhib/StreamHib-NodeJS/logs

# FFmpeg & gdown paths
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown
```

### **Step 8: Setup Gmail untuk Email**

1. **Enable 2-Factor Authentication** di Gmail
2. **Generate App Password**:
   - Buka [Google Account Security](https://myaccount.google.com/security)
   - Pilih "2-Step Verification" → "App passwords"
   - Pilih "Mail" dan "Other (Custom name)"
   - Masukkan "StreamHib"
   - Copy 16-digit password yang dihasilkan
3. **Update .env file** dengan app password tersebut

### **Step 9: Test Aplikasi**

```bash
# Test run aplikasi
npm start

# Jika berhasil, akan muncul:
# StreamHib server running on port 5000
# Environment: production
# Trial mode: DISABLED
# All services initialized successfully

# Test di browser
curl http://localhost:5000
# Atau buka http://your-server-ip:5000
```

### **Step 10: Setup Systemd Service**

```bash
# Buat service file
sudo nano /etc/systemd/system/streamhib.service
```

**Isi file service:**
```ini
[Unit]
Description=StreamHib Node.js Application
After=network.target

[Service]
Type=simple
User=streamhib
WorkingDirectory=/home/streamhib/streamhib/StreamHib-NodeJS
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=streamhib

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/streamhib/streamhib/StreamHib-NodeJS

[Install]
WantedBy=multi-user.target
```

```bash
# Reload systemd dan enable service
sudo systemctl daemon-reload
sudo systemctl enable streamhib
sudo systemctl start streamhib

# Check status
sudo systemctl status streamhib

# Check logs
sudo journalctl -u streamhib -f
```

### **Step 11: Setup Firewall**

```bash
# Install UFW jika belum ada
sudo apt install -y ufw

# Allow SSH
sudo ufw allow ssh

# Allow StreamHib port
sudo ufw allow 5000

# Allow HTTP/HTTPS jika pakai reverse proxy
sudo ufw allow 80
sudo ufw allow 443

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### **Step 12: Setup Reverse Proxy (Optional - Recommended)**

**Install Nginx:**
```bash
sudo apt install -y nginx

# Buat konfigurasi site
sudo nano /etc/nginx/sites-available/streamhib
```

**Isi konfigurasi Nginx:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/streamhib /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### **Step 13: Setup SSL dengan Let's Encrypt (Optional)**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate SSL certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

## 🔧 **Konfigurasi Lanjutan**

### **Monitoring & Logs**

```bash
# Install logrotate untuk log management
sudo nano /etc/logrotate.d/streamhib
```

**Isi logrotate config:**
```
/home/streamhib/streamhib/StreamHib-NodeJS/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
```

### **Backup Script**

```bash
# Buat script backup
nano ~/backup-streamhib.sh
```

**Isi backup script:**
```bash
#!/bin/bash
BACKUP_DIR="/home/streamhib/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup data files
tar -czf $BACKUP_DIR/streamhib-data-$DATE.tar.gz \
    /home/streamhib/streamhib/StreamHib-NodeJS/data/ \
    /home/streamhib/streamhib/StreamHib-NodeJS/.env

# Backup videos (optional - bisa besar)
# tar -czf $BACKUP_DIR/streamhib-videos-$DATE.tar.gz \
#     /home/streamhib/streamhib/StreamHib-NodeJS/videos/

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-data-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/streamhib-data-$DATE.tar.gz"
```

```bash
# Make executable
chmod +x ~/backup-streamhib.sh

# Add to crontab untuk backup harian
crontab -e
# Tambahkan line:
# 0 2 * * * /home/streamhib/backup-streamhib.sh
```

---

## 🎯 **First Run & Setup**

### **1. Akses Aplikasi**
```bash
# Buka browser ke:
http://your-server-ip:5000
# atau
http://your-domain.com
```

### **2. Registrasi Admin**
1. Klik "Daftar di sini"
2. Isi form registrasi:
   - Username: admin
   - Email: your-email@gmail.com
   - Password: strong-password
3. Akan menerima welcome email
4. Login dengan username atau email

### **3. Test Streaming**
1. Upload video test atau download dari Google Drive
2. Buat sesi streaming baru
3. Masukkan stream key YouTube/Facebook
4. Start streaming
5. Check di platform apakah live

---

## 🛠️ **Troubleshooting**

### **Service tidak start:**
```bash
# Check logs
sudo journalctl -u streamhib -n 50

# Check file permissions
ls -la /home/streamhib/streamhib/StreamHib-NodeJS/

# Check Node.js
node --version
npm --version
```

### **Email tidak terkirim:**
```bash
# Test email config
node -e "
const emailService = require('./src/services/emailService');
emailService.testConnection().then(result => {
  console.log('Email test:', result ? 'SUCCESS' : 'FAILED');
  process.exit(0);
});
"
```

### **FFmpeg error:**
```bash
# Check FFmpeg
ffmpeg -version
which ffmpeg

# Test FFmpeg
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 -f null -
```

### **Port sudah digunakan:**
```bash
# Check port usage
sudo netstat -tlnp | grep :5000
sudo lsof -i :5000

# Kill process jika perlu
sudo kill -9 PID
```

---

## 📊 **Monitoring & Maintenance**

### **Check Status:**
```bash
# Service status
sudo systemctl status streamhib

# Resource usage
htop
df -h
free -h

# Active streams
sudo systemctl list-units --type=service --state=running | grep stream-
```

### **Update Aplikasi:**
```bash
# Stop service
sudo systemctl stop streamhib

# Backup current version
cp -r StreamHib-NodeJS StreamHib-NodeJS.backup

# Update code
git pull origin main
# atau upload file baru

# Install new dependencies
npm install

# Start service
sudo systemctl start streamhib
```

### **Log Monitoring:**
```bash
# Real-time logs
sudo journalctl -u streamhib -f

# Application logs
tail -f logs/combined-$(date +%Y-%m-%d).log
tail -f logs/error-$(date +%Y-%m-%d).log
```

---

## 🎉 **Selesai!**

StreamHib Node.js sudah siap digunakan! Aplikasi akan:
- ✅ Auto-start saat server boot
- ✅ Auto-restart jika crash
- ✅ Mengirim email welcome & reset password
- ✅ Manage streaming sessions dengan systemd
- ✅ Log semua aktivitas
- ✅ Backup data secara otomatis

**Akses aplikasi di:** `http://your-domain.com` atau `http://your-server-ip:5000`

**Default admin:** Buat melalui halaman registrasi pertama kali.