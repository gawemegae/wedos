#!/bin/bash

# StreamHib Node.js Auto Installation Script for Ubuntu 22.04
# Repository: https://github.com/gawemegae/streamhibnodejs

set -e

echo "🚀 StreamHib Node.js Installation Script for Ubuntu 22.04"
echo "=========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as regular user with sudo privileges."
   exit 1
fi

# Check Ubuntu version
if ! grep -q "Ubuntu 22.04" /etc/os-release; then
    print_warning "This script is optimized for Ubuntu 22.04 LTS. Continue anyway? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

print_header "Step 1: System Update"
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

print_status "Installing basic dependencies..."
sudo apt install -y curl wget git nano htop unzip software-properties-common build-essential python3-pip

print_header "Step 2: Installing Node.js 18 LTS"
print_status "Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

print_status "Verifying Node.js installation..."
node_version=$(node --version)
npm_version=$(npm --version)
print_status "Node.js version: $node_version"
print_status "NPM version: $npm_version"

print_status "Installing PM2 globally..."
sudo npm install -g pm2

print_header "Step 3: Installing FFmpeg"
print_status "Installing FFmpeg..."
sudo apt install -y ffmpeg

print_status "Verifying FFmpeg installation..."
ffmpeg_version=$(ffmpeg -version | head -n1)
print_status "FFmpeg: $ffmpeg_version"

print_header "Step 4: Installing Python dependencies"
print_status "Installing Python and gdown..."
sudo apt install -y python3 python3-pip
sudo pip3 install gdown

print_status "Verifying gdown installation..."
gdown_version=$(gdown --version)
gdown_path=$(which gdown)
print_status "gdown version: $gdown_version"
print_status "gdown path: $gdown_path"

print_header "Step 5: Setting up StreamHib"
print_status "Creating StreamHib directory..."
mkdir -p ~/streamhib
cd ~/streamhib

# Check if StreamHib directory already exists
if [ -d "streamhibnodejs" ]; then
    print_warning "streamhibnodejs directory already exists. Remove it? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        rm -rf streamhibnodejs
    else
        print_error "Installation cancelled."
        exit 1
    fi
fi

print_status "Cloning StreamHib repository from GitHub..."
git clone https://github.com/gawemegae/streamhibnodejs.git
cd streamhibnodejs

print_status "Installing Node.js dependencies..."
npm install

print_status "Creating required directories..."
mkdir -p data videos logs
chmod 755 data videos logs

print_header "Step 6: Setting up Database"
print_status "Generating Prisma client..."
npx prisma generate

print_status "Creating database and tables..."
npx prisma db push

print_status "Seeding default data..."
npm run db:seed || print_warning "Seeding failed, but continuing..."

print_header "Step 7: Configuration"
print_status "Creating environment configuration..."

# Create .env file
cat > .env << EOF
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://$(hostname -I | awk '{print $1}'):5000

# Session Secret (CHANGE THIS!)
SESSION_SECRET=$(openssl rand -base64 32)

# Database
DATABASE_URL="file:./data/streamhib.db"

# Email Configuration (UPDATE THESE!)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-digit-app-password
EMAIL_FROM=StreamHib <your-email@gmail.com>

# Trial Mode
TRIAL_MODE_ENABLED=false
TRIAL_RESET_HOURS=24

# File Paths
VIDEO_DIR=$HOME/streamhib/streamhibnodejs/videos
LOGS_DIR=$HOME/streamhib/streamhibnodejs/logs

# FFmpeg & gdown paths
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown
EOF

print_status "Environment file created at .env"
print_warning "Please edit .env file to configure email settings!"

print_header "Step 8: Testing Application"
print_status "Testing application startup..."
timeout 10s npm start || true

print_header "Step 9: Creating Systemd Service"
print_status "Creating systemd service file..."

sudo tee /etc/systemd/system/streamhib.service > /dev/null << EOF
[Unit]
Description=StreamHib Node.js Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/streamhib/streamhibnodejs
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
ReadWritePaths=$HOME/streamhib/streamhibnodejs

[Install]
WantedBy=multi-user.target
EOF

print_status "Enabling and starting StreamHib service..."
sudo systemctl daemon-reload
sudo systemctl enable streamhib
sudo systemctl start streamhib

print_status "Checking service status..."
sleep 3
if sudo systemctl is-active --quiet streamhib; then
    print_status "✅ StreamHib service is running!"
else
    print_error "❌ StreamHib service failed to start. Check logs with: sudo journalctl -u streamhib -n 20"
fi

print_header "Step 10: Firewall Configuration"
print_status "Configuring UFW firewall..."
sudo ufw allow ssh
sudo ufw allow 5000
print_status "Firewall rules added. Enable with: sudo ufw enable"

print_header "Step 11: Creating Backup Script"
print_status "Creating backup script..."

cat > ~/backup-streamhib.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="$HOME/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp $HOME/streamhib/streamhibnodejs/data/streamhib.db $BACKUP_DIR/streamhib-db-$DATE.db

# Backup videos (optional - bisa besar)
# tar -czf $BACKUP_DIR/streamhib-videos-$DATE.tar.gz $HOME/streamhib/streamhibnodejs/videos/

# Backup config
cp $HOME/streamhib/streamhibnodejs/.env $BACKUP_DIR/streamhib-env-$DATE.env

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-db-*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/"
EOF

chmod +x ~/backup-streamhib.sh

print_header "Step 12: Creating Monitoring Script"
print_status "Creating monitoring script..."

cat > ~/monitor-streamhib.sh << 'EOF'
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_header() {
    echo -e "${BLUE}$1${NC}"
}

clear
print_header "🔍 StreamHib System Monitor"
echo "========================================"

# System Information
print_header "📊 System Information"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo "Memory Usage: $(free -h | awk 'NR==2{printf "%.1f%% (%s/%s)", $3*100/$2, $3, $2}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{printf "%s (%s)", $5, $4}')"
echo ""

# StreamHib Service Status
print_header "🚀 StreamHib Service Status"
if sudo systemctl is-active --quiet streamhib; then
    print_status "✅ StreamHib service is RUNNING"
    echo "   Started: $(sudo systemctl show streamhib --property=ActiveEnterTimestamp --value)"
    echo "   PID: $(sudo systemctl show streamhib --property=MainPID --value)"
else
    print_error "❌ StreamHib service is NOT RUNNING"
fi

# Check if port is listening
if netstat -tlnp 2>/dev/null | grep -q ":5000 "; then
    print_status "✅ Port 5000 is listening"
else
    print_warning "⚠️  Port 5000 is not listening"
fi
echo ""

# Database Status
print_header "🗄️ Database Status"
DB_PATH="$HOME/streamhib/streamhibnodejs/data/streamhib.db"
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    print_status "✅ Database exists (Size: $DB_SIZE)"
else
    print_error "❌ Database not found"
fi
echo ""

# Recent Logs
print_header "📋 Recent Logs (Last 5 lines)"
sudo journalctl -u streamhib -n 5 --no-pager -q 2>/dev/null || print_warning "⚠️  Unable to read service logs"
echo ""

print_header "🛠️  Quick Actions"
echo "1. View real-time logs"
echo "2. Restart StreamHib service"
echo "3. Check service status"
echo "4. Open database studio"
echo "5. Run backup"
echo "6. Exit"
echo ""

read -p "Choose an action (1-6): " choice

case $choice in
    1)
        print_status "Showing real-time logs (Press Ctrl+C to exit)..."
        sudo journalctl -u streamhib -f
        ;;
    2)
        print_status "Restarting StreamHib service..."
        sudo systemctl restart streamhib
        sleep 3
        if sudo systemctl is-active --quiet streamhib; then
            print_status "✅ Service restarted successfully"
        else
            print_error "❌ Service failed to restart"
        fi
        ;;
    3)
        sudo systemctl status streamhib
        ;;
    4)
        print_status "Opening Prisma Studio..."
        cd $HOME/streamhib/streamhibnodejs
        npx prisma studio
        ;;
    5)
        print_status "Running backup..."
        $HOME/backup-streamhib.sh
        ;;
    6)
        print_status "Goodbye!"
        exit 0
        ;;
    *)
        print_warning "Invalid choice"
        ;;
esac
EOF

chmod +x ~/monitor-streamhib.sh

print_header "🎉 Installation Complete!"
echo "========================================"
print_status "StreamHib Node.js has been installed successfully!"
echo ""
print_status "📍 Application URL: http://$(hostname -I | awk '{print $1}'):5000"
print_status "📁 Installation Directory: $HOME/streamhib/streamhibnodejs"
print_status "📄 Service Name: streamhib"
print_status "📋 Logs: sudo journalctl -u streamhib -f"
print_status "🔧 Monitor: ~/monitor-streamhib.sh"
print_status "💾 Backup: ~/backup-streamhib.sh"
echo ""
print_warning "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit .env file to configure email settings:"
echo "   nano ~/streamhib/streamhibnodejs/.env"
echo ""
echo "2. Restart service after configuration:"
echo "   sudo systemctl restart streamhib"
echo ""
echo "3. Enable firewall:"
echo "   sudo ufw enable"
echo ""
echo "4. Access application and create admin account:"
echo "   http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "5. Setup Gmail App Password for email notifications"
echo ""
print_status "📚 Full documentation: ~/streamhib/streamhibnodejs/INSTALLATION-UBUNTU.md"
print_status "🔍 System monitor: ~/monitor-streamhib.sh"
print_status "💾 Backup script: ~/backup-streamhib.sh"
echo ""
print_status "Installation completed successfully! 🚀"
print_status "Repository: https://github.com/gawemegae/streamhibnodejs"