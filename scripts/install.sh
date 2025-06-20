#!/bin/bash

# StreamHib Node.js Auto Installation Script
# Tested on Ubuntu 22.04 LTS

set -e

echo "🚀 StreamHib Node.js Installation Script"
echo "========================================"

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
if [ -d "StreamHib-NodeJS" ]; then
    print_warning "StreamHib-NodeJS directory already exists. Remove it? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        rm -rf StreamHib-NodeJS
    else
        print_error "Installation cancelled."
        exit 1
    fi
fi

print_status "Please upload your StreamHib-NodeJS files to ~/streamhib/StreamHib-NodeJS"
print_status "Or clone from git repository if available."
print_status "Press Enter when files are ready..."
read -r

# Check if files exist
if [ ! -d "StreamHib-NodeJS" ]; then
    print_error "StreamHib-NodeJS directory not found. Please upload the files first."
    exit 1
fi

cd StreamHib-NodeJS

print_status "Installing Node.js dependencies..."
npm install

print_status "Creating required directories..."
mkdir -p data videos logs
chmod 755 data videos logs

print_header "Step 6: Configuration"
print_status "Creating environment configuration..."

# Create .env file
cat > .env << EOF
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://localhost:5000

# Session Secret (CHANGE THIS!)
SESSION_SECRET=$(openssl rand -base64 32)

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
SESSIONS_FILE=$HOME/streamhib/StreamHib-NodeJS/data/sessions.json
USERS_FILE=$HOME/streamhib/StreamHib-NodeJS/data/users.json
RESET_TOKENS_FILE=$HOME/streamhib/StreamHib-NodeJS/data/reset_tokens.json
VIDEO_DIR=$HOME/streamhib/StreamHib-NodeJS/videos
LOGS_DIR=$HOME/streamhib/StreamHib-NodeJS/logs

# FFmpeg & gdown paths
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown
EOF

print_status "Environment file created at .env"
print_warning "Please edit .env file to configure email settings!"

print_header "Step 7: Testing Application"
print_status "Testing application startup..."
timeout 10s npm start || true

print_header "Step 8: Creating Systemd Service"
print_status "Creating systemd service file..."

sudo tee /etc/systemd/system/streamhib.service > /dev/null << EOF
[Unit]
Description=StreamHib Node.js Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/streamhib/StreamHib-NodeJS
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
ReadWritePaths=$HOME/streamhib/StreamHib-NodeJS

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

print_header "Step 9: Firewall Configuration"
print_status "Configuring UFW firewall..."
sudo ufw allow ssh
sudo ufw allow 5000
print_status "Firewall rules added. Enable with: sudo ufw enable"

print_header "Step 10: Creating Backup Script"
print_status "Creating backup script..."

cat > ~/backup-streamhib.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="$HOME/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup data files
tar -czf $BACKUP_DIR/streamhib-data-$DATE.tar.gz \
    $HOME/streamhib/StreamHib-NodeJS/data/ \
    $HOME/streamhib/StreamHib-NodeJS/.env

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-data-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/streamhib-data-$DATE.tar.gz"
EOF

chmod +x ~/backup-streamhib.sh

print_header "🎉 Installation Complete!"
echo "========================================"
print_status "StreamHib Node.js has been installed successfully!"
echo ""
print_status "📍 Application URL: http://$(hostname -I | awk '{print $1}'):5000"
print_status "📁 Installation Directory: $HOME/streamhib/StreamHib-NodeJS"
print_status "📄 Service Name: streamhib"
print_status "📋 Logs: sudo journalctl -u streamhib -f"
echo ""
print_warning "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit .env file to configure email settings:"
echo "   nano ~/streamhib/StreamHib-NodeJS/.env"
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
print_status "📚 Full documentation: ~/streamhib/StreamHib-NodeJS/INSTALLATION.md"
print_status "🔧 Backup script: ~/backup-streamhib.sh"
echo ""
print_status "Installation completed successfully! 🚀"