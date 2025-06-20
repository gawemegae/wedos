# StreamHib Node.js - Complete Installation Guide (Ubuntu 22.04)

## 🚀 **INSTALASI TERCEPAT & TERBAIK**

### **Step 1: Persiapan Server**

```bash
# Login sebagai root
sudo su -

# Update sistem
apt update && apt upgrade -y

# Install dependencies dasar
apt install -y curl wget git nano htop unzip software-properties-common build-essential python3-pip sqlite3

# Reboot jika ada kernel update
reboot
```

### **Step 2: Install Node.js 18 LTS**

```bash
# Login kembali sebagai root
sudo su -

# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 globally
npm install -g pm2
```

### **Step 3: Install FFmpeg**

```bash
# Install FFmpeg
apt install -y ffmpeg

# Verify installation
ffmpeg -version

# Test FFmpeg
ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 -f null -
```

### **Step 4: Install Python & gdown**

```bash
# Install Python dan pip
apt install -y python3 python3-pip

# Install gdown untuk Google Drive download
pip3 install gdown

# Verify installation
gdown --version
which gdown  # Should show /usr/local/bin/gdown
```

### **Step 5: Setup StreamHib**

```bash
# Buat direktori aplikasi
mkdir -p /opt/streamhib
cd /opt/streamhib

# Clone repository (atau upload manual)
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

# Seed default data
npm run db:seed
```

### **Step 7: Konfigurasi Environment**

```bash
# Buat file environment
cat > .env << 'EOF'
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://YOUR_SERVER_IP:5000

# Session Secret (CHANGE THIS!)
SESSION_SECRET=streamhib-super-secret-key-change-this-in-production

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
VIDEO_DIR=/opt/streamhib/streamhibnodejs/videos
LOGS_DIR=/opt/streamhib/streamhibnodejs/logs

# FFmpeg & gdown paths
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown

# CORS Configuration
CORS_ORIGIN=http://YOUR_SERVER_IP:5000
EOF

# Edit dengan IP server Anda
nano .env
```

### **Step 8: Test Aplikasi**

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
# Atau buka http://YOUR_SERVER_IP:5000
```

### **Step 9: Setup Systemd Service (Root)**

```bash
# Buat service file untuk root
cat > /etc/systemd/system/streamhib.service << 'EOF'
[Unit]
Description=StreamHib Node.js Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/streamhib/streamhibnodejs
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=streamhib

# Security settings (relaxed for root)
NoNewPrivileges=false
PrivateTmp=false
ProtectSystem=false
ProtectHome=false

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd dan enable service
systemctl daemon-reload
systemctl enable streamhib
systemctl start streamhib

# Check status
systemctl status streamhib

# Check logs
journalctl -u streamhib -f
```

### **Step 10: Setup Firewall**

```bash
# Install UFW jika belum ada
apt install -y ufw

# Allow SSH
ufw allow ssh

# Allow StreamHib port
ufw allow 5000

# Allow HTTP/HTTPS untuk reverse proxy
ufw allow 80
ufw allow 443

# Enable firewall
ufw enable

# Check status
ufw status
```

### **Step 11: Setup Nginx Reverse Proxy (Optional)**

```bash
# Install Nginx
apt install -y nginx

# Buat konfigurasi site
cat > /etc/nginx/sites-available/streamhib << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

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
EOF

# Enable site
ln -s /etc/nginx/sites-available/streamhib /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Update BASE_URL di .env
sed -i "s|BASE_URL=.*|BASE_URL=http://YOUR_DOMAIN_OR_IP|" /opt/streamhib/streamhibnodejs/.env

# Restart StreamHib
systemctl restart streamhib
```

### **Step 12: Setup SSL dengan Let's Encrypt (Optional)**

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Generate SSL certificate (ganti dengan domain Anda)
certbot --nginx -d your-domain.com

# Test auto-renewal
certbot renew --dry-run
```

---

## 🛠️ **SCRIPT INSTALASI OTOMATIS**

Buat script untuk instalasi otomatis:

```bash
# Buat script instalasi
cat > /root/install-streamhib.sh << 'EOF'
#!/bin/bash

set -e

echo "🚀 StreamHib Node.js Auto Installation Script"
echo "=============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_status "Step 1: System Update"
apt update && apt upgrade -y
apt install -y curl wget git nano htop unzip software-properties-common build-essential python3-pip sqlite3

print_status "Step 2: Installing Node.js 18 LTS"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
npm install -g pm2

print_status "Step 3: Installing FFmpeg"
apt install -y ffmpeg

print_status "Step 4: Installing Python & gdown"
apt install -y python3 python3-pip
pip3 install gdown

print_status "Step 5: Setting up StreamHib"
mkdir -p /opt/streamhib
cd /opt/streamhib

# Check if directory exists
if [ -d "streamhibnodejs" ]; then
    print_warning "StreamHib directory exists. Removing..."
    rm -rf streamhibnodejs
fi

git clone https://github.com/gawemegae/streamhibnodejs.git
cd streamhibnodejs

npm install
mkdir -p data videos logs
chmod 755 data videos logs

print_status "Step 6: Setting up Database"
npx prisma generate
npx prisma db push
npm run db:seed

print_status "Step 7: Creating Environment Configuration"
cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://$(hostname -I | awk '{print $1}'):5000

SESSION_SECRET=streamhib-$(openssl rand -base64 32)

DATABASE_URL="file:./data/streamhib.db"

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-digit-app-password
EMAIL_FROM=StreamHib <your-email@gmail.com>

TRIAL_MODE_ENABLED=false
TRIAL_RESET_HOURS=24

VIDEO_DIR=/opt/streamhib/streamhibnodejs/videos
LOGS_DIR=/opt/streamhib/streamhibnodejs/logs

FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown

CORS_ORIGIN=http://$(hostname -I | awk '{print $1}'):5000
ENVEOF

print_status "Step 8: Creating Systemd Service"
cat > /etc/systemd/system/streamhib.service << 'SERVICEEOF'
[Unit]
Description=StreamHib Node.js Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/streamhib/streamhibnodejs
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=streamhib

NoNewPrivileges=false
PrivateTmp=false
ProtectSystem=false
ProtectHome=false

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable streamhib
systemctl start streamhib

print_status "Step 9: Setting up Firewall"
apt install -y ufw
ufw allow ssh
ufw allow 5000
ufw --force enable

print_status "🎉 Installation Complete!"
echo "========================================"
print_status "StreamHib Node.js installed successfully!"
echo ""
print_status "📍 Application URL: http://$(hostname -I | awk '{print $1}'):5000"
print_status "📁 Installation Directory: /opt/streamhib/streamhibnodejs"
print_status "📄 Service Name: streamhib"
print_status "📋 Logs: journalctl -u streamhib -f"
echo ""
print_warning "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit email configuration:"
echo "   nano /opt/streamhib/streamhibnodejs/.env"
echo ""
echo "2. Restart service after configuration:"
echo "   systemctl restart streamhib"
echo ""
echo "3. Access application and create admin account:"
echo "   http://$(hostname -I | awk '{print $1}'):5000"
echo ""
print_status "Installation completed successfully! 🚀"
EOF

chmod +x /root/install-streamhib.sh
```

---

## 🎯 **CARA TERCEPAT - JALANKAN SCRIPT**

```bash
# Login sebagai root
sudo su -

# Download dan jalankan script
wget -O install-streamhib.sh https://raw.githubusercontent.com/gawemegae/streamhibnodejs/main/install-streamhib.sh
chmod +x install-streamhib.sh
./install-streamhib.sh
```

---

## 🔧 **MONITORING & MAINTENANCE**

### **Check Status:**
```bash
# Service status
systemctl status streamhib

# Real-time logs
journalctl -u streamhib -f

# Resource usage
htop
df -h
```

### **Backup Script:**
```bash
cat > /root/backup-streamhib.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp /opt/streamhib/streamhibnodejs/data/streamhib.db $BACKUP_DIR/streamhib-db-$DATE.db

# Backup config
cp /opt/streamhib/streamhibnodejs/.env $BACKUP_DIR/streamhib-env-$DATE.env

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-db-*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/"
EOF

chmod +x /root/backup-streamhib.sh

# Add to crontab untuk backup harian
echo "0 2 * * * /root/backup-streamhib.sh" | crontab -
```

---

## 🎉 **SELESAI!**

**Akses aplikasi di:** `http://YOUR_SERVER_IP:5000`

**Default setup:**
- ✅ Database SQLite yang robust
- ✅ Auto-restart service
- ✅ Firewall configured
- ✅ Backup script ready
- ✅ Production ready

**Buat admin account melalui halaman registrasi pertama kali!**