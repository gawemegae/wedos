# StreamHib Node.js - Panduan Instalasi Ubuntu 22.04

## 🖥️ **Persiapan Server Ubuntu 22.04**

### **Spesifikasi Minimum:**
- **RAM**: 2GB (4GB recommended)
- **Storage**: 20GB (50GB+ untuk video storage)
- **CPU**: 2 cores (4 cores recommended)
- **Network**: 100Mbps+ untuk streaming
- **OS**: Ubuntu 22.04 LTS Server

---

## 🚀 **Instalasi Otomatis (Recommended)**

### **Step 1: Download Script Instalasi**
```bash
# Login ke server Ubuntu sebagai user biasa (bukan root)
wget https://raw.githubusercontent.com/gawemegae/streamhibnodejs/main/scripts/install-ubuntu.sh
chmod +x install-ubuntu.sh
```

### **Step 2: Jalankan Instalasi**
```bash
./install-ubuntu.sh
```

Script akan otomatis:
- ✅ Update sistem
- ✅ Install Node.js 18 LTS
- ✅ Install FFmpeg
- ✅ Install Python & gdown
- ✅ Clone repository dari GitHub
- ✅ Setup database SQLite
- ✅ Konfigurasi systemd service
- ✅ Setup firewall

---

## 📋 **Instalasi Manual (Step by Step)**

### **Step 1: Update Sistem**
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git nano htop unzip software-properties-common build-essential python3-pip

# Reboot jika ada kernel update
sudo reboot
```

### **Step 2: Install Node.js 18 LTS**
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 untuk production
sudo npm install -g pm2
```

### **Step 3: Install FFmpeg**
```bash
# Install FFmpeg
sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version

# Test FFmpeg
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 -f null -
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

### **Step 5: Clone Repository**
```bash
# Buat direktori kerja
mkdir -p ~/streamhib
cd ~/streamhib

# Clone repository dari GitHub
git clone https://github.com/gawemegae/streamhibnodejs.git
cd streamhibnodejs

# Install dependencies
npm install

# Buat direktori yang diperlukan
mkdir -p data videos logs
chmod 755 data videos logs
```

### **Step 6: Setup Database**
```bash
# Generate Prisma client
npx prisma generate

# Create database dan tables
npx prisma db push

# (Optional) Seed default data
npm run db:seed
```

### **Step 7: Konfigurasi Environment**
```bash
# Copy dan edit file environment
cp .env.example .env
nano .env
```

**Edit file `.env`:**
```bash
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://your-server-ip:5000

# Session Secret (CHANGE THIS!)
SESSION_SECRET=your-super-secret-key-here-change-this

# Database
DATABASE_URL="file:./data/streamhib.db"

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

# File Paths
VIDEO_DIR=/home/$USER/streamhib/streamhibnodejs/videos
LOGS_DIR=/home/$USER/streamhib/streamhibnodejs/logs

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
# Database connected successfully
# All services initialized successfully

# Test di browser (buka tab baru)
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
User=$USER
WorkingDirectory=/home/$USER/streamhib/streamhibnodejs
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
ReadWritePaths=/home/$USER/streamhib/streamhibnodejs

[Install]
WantedBy=multi-user.target
```

```bash
# Ganti $USER dengan username Anda
sudo sed -i "s/\$USER/$USER/g" /etc/systemd/system/streamhib.service

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

---

## 🌐 **Setup Reverse Proxy dengan Nginx (Optional)**

### **Install Nginx:**
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

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Increase client max body size for video uploads
    client_max_body_size 500M;

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
        
        # Increase timeouts for streaming
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 86400s;
    }

    # Handle Socket.IO connections
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/streamhib /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Update BASE_URL di .env
nano ~/.streamhib/streamhibnodejs/.env
# Ubah: BASE_URL=http://your-domain.com

# Restart StreamHib
sudo systemctl restart streamhib
```

---

## 🔒 **Setup SSL dengan Let's Encrypt (Optional)**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate SSL certificate
sudo certbot --nginx -d your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
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

# Check database
cd ~/streamhib/streamhibnodejs
npx prisma studio

# Check Node.js
node --version
npm --version
```

### **Database error:**
```bash
# Reset database
cd ~/streamhib/streamhibnodejs
rm -f data/streamhib.db
npx prisma db push
npm run db:seed
```

### **Email tidak terkirim:**
```bash
# Test email config
cd ~/streamhib/streamhibnodejs
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

# Database size
ls -lh ~/streamhib/streamhibnodejs/data/

# Active streams
sudo systemctl list-units --type=service --state=running | grep stream-
```

### **Update Aplikasi:**
```bash
# Stop service
sudo systemctl stop streamhib

# Backup database
cp ~/streamhib/streamhibnodejs/data/streamhib.db ~/streamhib/backup-$(date +%Y%m%d).db

# Update code
cd ~/streamhib/streamhibnodejs
git pull origin main

# Install new dependencies
npm install

# Update database schema
npx prisma db push

# Start service
sudo systemctl start streamhib
```

### **Backup & Restore:**
```bash
# Backup script
cat > ~/backup-streamhib.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="$HOME/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp $HOME/streamhib/streamhibnodejs/data/streamhib.db $BACKUP_DIR/streamhib-db-$DATE.db

# Backup videos (optional - bisa besar)
tar -czf $BACKUP_DIR/streamhib-videos-$DATE.tar.gz \
    $HOME/streamhib/streamhibnodejs/videos/

# Backup config
cp $HOME/streamhib/streamhibnodejs/.env $BACKUP_DIR/streamhib-env-$DATE.env

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-db-*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/"
EOF

chmod +x ~/backup-streamhib.sh

# Add to crontab untuk backup harian
crontab -e
# Tambahkan line:
# 0 2 * * * /home/$USER/backup-streamhib.sh
```

---

## 🎉 **Selesai!**

StreamHib Node.js dengan database SQLite sudah siap digunakan! Aplikasi akan:
- ✅ Auto-start saat server boot
- ✅ Auto-restart jika crash
- ✅ Database SQLite yang robust
- ✅ Email notifications
- ✅ Manage streaming sessions
- ✅ Log semua aktivitas
- ✅ Backup otomatis

**Akses aplikasi di:** `http://your-domain.com` atau `http://your-server-ip:5000`

**Default admin:** Buat melalui halaman registrasi pertama kali.

**Repository:** https://github.com/gawemegae/streamhibnodejs