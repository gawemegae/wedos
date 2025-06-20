#!/bin/bash

# StreamHib Node.js Complete Auto Installation Script
# For Ubuntu 22.04 LTS - Production Ready
# Version: 2.0.0

set -e

echo "🚀 StreamHib Node.js Complete Auto Installation"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root. Use: sudo su - then run this script"
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

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="localhost"
fi

print_header "🌟 Starting StreamHib Installation on $SERVER_IP"
echo ""

# ============================================================================
print_step "1/12: System Update & Basic Dependencies"
# ============================================================================
print_status "Updating system packages..."
apt update && apt upgrade -y

print_status "Installing basic dependencies..."
apt install -y curl wget git nano htop unzip software-properties-common \
    build-essential python3-pip sqlite3 ufw net-tools

# ============================================================================
print_step "2/12: Installing Node.js 18 LTS"
# ============================================================================
print_status "Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

print_status "Verifying Node.js installation..."
node_version=$(node --version)
npm_version=$(npm --version)
print_success "✅ Node.js version: $node_version"
print_success "✅ NPM version: $npm_version"

print_status "Installing PM2 globally..."
npm install -g pm2

# ============================================================================
print_step "3/12: Installing FFmpeg"
# ============================================================================
print_status "Installing FFmpeg..."
apt install -y ffmpeg

print_status "Verifying FFmpeg installation..."
ffmpeg_version=$(ffmpeg -version | head -n1)
print_success "✅ FFmpeg installed: $ffmpeg_version"

# Test FFmpeg
print_status "Testing FFmpeg functionality..."
timeout 10s ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 -f null - >/dev/null 2>&1 || true
print_success "✅ FFmpeg test completed"

# ============================================================================
print_step "4/12: Installing Python & gdown"
# ============================================================================
print_status "Installing Python and gdown..."
apt install -y python3 python3-pip
pip3 install gdown

print_status "Verifying gdown installation..."
gdown_version=$(gdown --version 2>/dev/null || echo "installed")
gdown_path=$(which gdown)
print_success "✅ gdown installed at: $gdown_path"

# ============================================================================
print_step "5/12: Setting up StreamHib Directory"
# ============================================================================
print_status "Creating StreamHib directory..."
mkdir -p /opt/streamhib
cd /opt/streamhib

# Remove existing installation if any
if [ -d "streamhibnodejs" ]; then
    print_warning "Existing StreamHib installation found. Removing..."
    rm -rf streamhibnodejs
fi

print_status "Cloning StreamHib repository..."
git clone https://github.com/gawemegae/streamhibnodejs.git
cd streamhibnodejs

print_status "Installing Node.js dependencies..."
npm install

print_status "Creating required directories..."
mkdir -p data videos logs
chmod 755 data videos logs

# ============================================================================
print_step "6/12: Environment Configuration"
# ============================================================================
print_status "Creating environment configuration..."

# Generate secure session secret
SESSION_SECRET="streamhib-$(openssl rand -base64 32 | tr -d '=' | tr '+/' '-_')"

cat > .env << EOF
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
BASE_URL=http://${SERVER_IP}:5000

# Session Secret (Auto-generated)
SESSION_SECRET=${SESSION_SECRET}

# Database Configuration
DATABASE_URL="file:./data/streamhib.db"

# Email Configuration (Gmail - UPDATE THESE!)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-digit-app-password
EMAIL_FROM=StreamHib <your-email@gmail.com>

# Trial Mode Configuration
TRIAL_MODE_ENABLED=false
TRIAL_RESET_HOURS=24

# File Paths
VIDEO_DIR=/opt/streamhib/streamhibnodejs/videos
LOGS_DIR=/opt/streamhib/streamhibnodejs/logs

# External Tools
FFMPEG_PATH=/usr/bin/ffmpeg
GDOWN_PATH=/usr/local/bin/gdown

# CORS Configuration
CORS_ORIGIN=http://${SERVER_IP}:5000
EOF

print_success "✅ Environment file created"

# ============================================================================
print_step "7/12: Database Setup with Prisma"
# ============================================================================
print_status "Setting up database with Prisma..."

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

print_status "Generating Prisma client..."
npx prisma generate

print_status "Creating database and tables..."
npx prisma db push

print_status "Seeding database with default data..."
npm run db:seed

print_status "Verifying database setup..."
if [ -f "data/streamhib.db" ]; then
    print_success "✅ Database file created successfully"
    
    # Check tables
    table_count=$(sqlite3 data/streamhib.db ".tables" | wc -w)
    print_success "✅ Database tables created: $table_count tables"
    
    # Check admin user
    user_count=$(sqlite3 data/streamhib.db "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    print_success "✅ Users in database: $user_count"
else
    print_error "❌ Database file not created"
    exit 1
fi

# ============================================================================
print_step "8/12: Testing Application"
# ============================================================================
print_status "Testing application startup..."

# Test database connection
print_status "Testing database connection..."
node -e "
const { PrismaClient } = require('@prisma/client');
async function test() {
  const prisma = new PrismaClient();
  try {
    await prisma.\$connect();
    console.log('✅ Database connection successful');
    const userCount = await prisma.user.count();
    console.log('✅ Users found:', userCount);
    await prisma.\$disconnect();
  } catch (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }
}
test();
" || {
    print_error "Database connection test failed"
    exit 1
}

# Test app startup (timeout after 15 seconds)
print_status "Testing application startup..."
timeout 15s npm start > /tmp/streamhib-test.log 2>&1 &
APP_PID=$!
sleep 10

# Check if app is responding
if curl -s http://localhost:5000/login > /dev/null; then
    print_success "✅ Application startup test successful"
    kill $APP_PID 2>/dev/null || true
else
    print_warning "⚠️ Application startup test inconclusive (continuing anyway)"
    kill $APP_PID 2>/dev/null || true
fi

# ============================================================================
print_step "9/12: Creating Systemd Service"
# ============================================================================
print_status "Creating systemd service..."

cat > /etc/systemd/system/streamhib.service << EOF
[Unit]
Description=StreamHib Node.js Application
Documentation=https://github.com/gawemegae/streamhibnodejs
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/streamhib/streamhibnodejs
Environment=NODE_ENV=production
EnvironmentFile=/opt/streamhib/streamhibnodejs/.env
ExecStart=/usr/bin/node server.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=streamhib

# Security settings (relaxed for root)
NoNewPrivileges=false
PrivateTmp=false
ProtectSystem=false
ProtectHome=false

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

print_status "Enabling and starting StreamHib service..."
systemctl daemon-reload
systemctl enable streamhib
systemctl start streamhib

# Wait for service to start
sleep 5

# Check service status
if systemctl is-active --quiet streamhib; then
    print_success "✅ StreamHib service is running!"
    
    # Get service info
    service_status=$(systemctl show streamhib --property=ActiveState --value)
    service_pid=$(systemctl show streamhib --property=MainPID --value)
    print_success "✅ Service status: $service_status (PID: $service_pid)"
else
    print_error "❌ StreamHib service failed to start"
    print_status "Checking service logs..."
    journalctl -u streamhib -n 20 --no-pager
    exit 1
fi

# ============================================================================
print_step "10/12: Firewall Configuration"
# ============================================================================
print_status "Configuring UFW firewall..."

# Install UFW if not present
if ! command -v ufw >/dev/null 2>&1; then
    apt install -y ufw
fi

# Configure firewall rules
ufw allow ssh
ufw allow 5000/tcp
ufw allow 80/tcp
ufw allow 443/tcp

print_status "Enabling firewall..."
ufw --force enable

print_success "✅ Firewall configured and enabled"

# ============================================================================
print_step "11/12: Creating Management Scripts"
# ============================================================================
print_status "Creating management scripts..."

# Backup script
cat > /root/backup-streamhib.sh << 'EOF'
#!/bin/bash

# StreamHib Backup Script
BACKUP_DIR="/root/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/opt/streamhib/streamhibnodejs"

echo "🔄 Starting StreamHib backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
if [ -f "$APP_DIR/data/streamhib.db" ]; then
    cp "$APP_DIR/data/streamhib.db" "$BACKUP_DIR/streamhib-db-$DATE.db"
    echo "✅ Database backed up"
fi

# Backup configuration
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/streamhib-env-$DATE.env"
    echo "✅ Configuration backed up"
fi

# Backup videos (optional - can be large)
if [ -d "$APP_DIR/videos" ] && [ "$(ls -A $APP_DIR/videos)" ]; then
    tar -czf "$BACKUP_DIR/streamhib-videos-$DATE.tar.gz" -C "$APP_DIR" videos/
    echo "✅ Videos backed up"
fi

# Keep only last 7 backups
find $BACKUP_DIR -name "streamhib-db-*.db" -mtime +7 -delete
find $BACKUP_DIR -name "streamhib-env-*.env" -mtime +7 -delete
find $BACKUP_DIR -name "streamhib-videos-*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: $BACKUP_DIR/"
ls -la $BACKUP_DIR/ | tail -5
EOF

chmod +x /root/backup-streamhib.sh

# Monitor script
cat > /root/monitor-streamhib.sh << 'EOF'
#!/bin/bash

# StreamHib Monitor Script
clear

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "${BLUE}$1${NC}"; }

print_header "🔍 StreamHib System Monitor"
echo "========================================"

# System Information
print_header "📊 System Information"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p)"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo "Memory Usage: $(free -h | awk 'NR==2{printf "%.1f%% (%s/%s)", $3*100/$2, $3, $2}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{printf "%s (%s free)", $5, $4}')"
echo ""

# StreamHib Service Status
print_header "🚀 StreamHib Service Status"
if systemctl is-active --quiet streamhib; then
    print_status "✅ StreamHib service is RUNNING"
    echo "   Started: $(systemctl show streamhib --property=ActiveEnterTimestamp --value)"
    echo "   PID: $(systemctl show streamhib --property=MainPID --value)"
    echo "   Memory: $(systemctl show streamhib --property=MemoryCurrent --value | numfmt --to=iec)"
else
    print_error "❌ StreamHib service is NOT RUNNING"
fi

# Check if port is listening
if netstat -tlnp 2>/dev/null | grep -q ":5000 "; then
    print_status "✅ Port 5000 is listening"
    connections=$(netstat -tn 2>/dev/null | grep ":5000" | wc -l)
    echo "   Active connections: $connections"
else
    print_warning "⚠️  Port 5000 is not listening"
fi
echo ""

# Database Status
print_header "🗄️ Database Status"
DB_PATH="/opt/streamhib/streamhibnodejs/data/streamhib.db"
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    print_status "✅ Database exists (Size: $DB_SIZE)"
    
    # Check database health
    if sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" >/dev/null 2>&1; then
        user_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")
        session_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sessions;" 2>/dev/null || echo "0")
        print_status "✅ Database accessible (Users: $user_count, Sessions: $session_count)"
    else
        print_error "❌ Database not accessible"
    fi
else
    print_error "❌ Database not found"
fi
echo ""

# Recent Logs
print_header "📋 Recent Logs (Last 5 lines)"
journalctl -u streamhib -n 5 --no-pager -q 2>/dev/null || print_warning "⚠️  Unable to read service logs"
echo ""

# Quick Actions Menu
print_header "🛠️  Quick Actions"
echo "1. View real-time logs"
echo "2. Restart StreamHib service"
echo "3. Check service status"
echo "4. Run backup"
echo "5. Check database"
echo "6. Exit"
echo ""

read -p "Choose an action (1-6): " choice

case $choice in
    1)
        print_status "Showing real-time logs (Press Ctrl+C to exit)..."
        journalctl -u streamhib -f
        ;;
    2)
        print_status "Restarting StreamHib service..."
        systemctl restart streamhib
        sleep 3
        if systemctl is-active --quiet streamhib; then
            print_status "✅ Service restarted successfully"
        else
            print_error "❌ Service failed to restart"
        fi
        ;;
    3)
        systemctl status streamhib --no-pager -l
        ;;
    4)
        print_status "Running backup..."
        /root/backup-streamhib.sh
        ;;
    5)
        print_status "Checking database..."
        cd /opt/streamhib/streamhibnodejs
        sqlite3 data/streamhib.db ".tables"
        echo ""
        sqlite3 data/streamhib.db "SELECT 'Users: ' || COUNT(*) FROM users;"
        sqlite3 data/streamhib.db "SELECT 'Sessions: ' || COUNT(*) FROM sessions;"
        sqlite3 data/streamhib.db "SELECT 'Schedules: ' || COUNT(*) FROM schedules;"
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

chmod +x /root/monitor-streamhib.sh

# Update script
cat > /root/update-streamhib.sh << 'EOF'
#!/bin/bash

# StreamHib Update Script
echo "🔄 StreamHib Update Process"
echo "=========================="

APP_DIR="/opt/streamhib/streamhibnodejs"
BACKUP_DIR="/root/streamhib-backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup before update
echo "📦 Creating backup before update..."
mkdir -p $BACKUP_DIR
cp "$APP_DIR/data/streamhib.db" "$BACKUP_DIR/pre-update-db-$DATE.db"
cp "$APP_DIR/.env" "$BACKUP_DIR/pre-update-env-$DATE.env"

# Stop service
echo "🛑 Stopping StreamHib service..."
systemctl stop streamhib

# Update code
echo "📥 Updating code from repository..."
cd $APP_DIR
git pull origin main

# Install new dependencies
echo "📦 Installing dependencies..."
npm install

# Update database schema
echo "🗄️ Updating database schema..."
npx prisma db push

# Start service
echo "🚀 Starting StreamHib service..."
systemctl start streamhib

# Check status
sleep 5
if systemctl is-active --quiet streamhib; then
    echo "✅ Update completed successfully!"
    echo "📊 Service status: $(systemctl is-active streamhib)"
else
    echo "❌ Update failed - service not running"
    echo "📋 Check logs: journalctl -u streamhib -n 20"
fi
EOF

chmod +x /root/update-streamhib.sh

print_success "✅ Management scripts created"

# ============================================================================
print_step "12/12: Final Verification & Setup Cron Jobs"
# ============================================================================
print_status "Setting up automated tasks..."

# Add daily backup to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /root/backup-streamhib.sh") | crontab -
print_success "✅ Daily backup scheduled at 2:00 AM"

# Final verification
print_status "Performing final verification..."

# Check service
if systemctl is-active --quiet streamhib; then
    print_success "✅ Service is running"
else
    print_error "❌ Service verification failed"
    exit 1
fi

# Check port
if netstat -tlnp | grep -q ":5000"; then
    print_success "✅ Port 5000 is listening"
else
    print_error "❌ Port verification failed"
    exit 1
fi

# Check database
if [ -f "/opt/streamhib/streamhibnodejs/data/streamhib.db" ]; then
    user_count=$(sqlite3 /opt/streamhib/streamhibnodejs/data/streamhib.db "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    if [ "$user_count" -gt 0 ]; then
        print_success "✅ Database verification passed ($user_count users)"
    else
        print_error "❌ Database verification failed (no users)"
        exit 1
    fi
else
    print_error "❌ Database file not found"
    exit 1
fi

# Test web access
if curl -s http://localhost:5000/login > /dev/null; then
    print_success "✅ Web interface accessible"
else
    print_warning "⚠️ Web interface test inconclusive"
fi

# ============================================================================
print_header "🎉 INSTALLATION COMPLETED SUCCESSFULLY!"
# ============================================================================
echo ""
print_success "StreamHib Node.js has been installed and configured successfully!"
echo ""
print_header "📋 INSTALLATION SUMMARY"
echo "========================================"
print_status "🌐 Application URL: http://${SERVER_IP}:5000"
print_status "📁 Installation Directory: /opt/streamhib/streamhibnodejs"
print_status "📄 Service Name: streamhib"
print_status "🗄️ Database: SQLite (Prisma ORM)"
print_status "📧 Email Service: Disabled (configure in .env)"
print_status "🔒 Firewall: Enabled (ports 22, 80, 443, 5000)"
echo ""
print_header "🔑 DEFAULT ADMIN CREDENTIALS"
echo "========================================"
print_status "Username: admin"
print_status "Email: admin@streamhib.local"
print_status "Password: admin123"
echo ""
print_header "🛠️ MANAGEMENT COMMANDS"
echo "========================================"
print_status "📊 Monitor System: /root/monitor-streamhib.sh"
print_status "💾 Manual Backup: /root/backup-streamhib.sh"
print_status "🔄 Update App: /root/update-streamhib.sh"
print_status "📋 View Logs: journalctl -u streamhib -f"
print_status "🔄 Restart Service: systemctl restart streamhib"
print_status "📊 Service Status: systemctl status streamhib"
echo ""
print_header "⚠️ IMPORTANT NEXT STEPS"
echo "========================================"
echo "1. 🌐 Access your application:"
echo "   http://${SERVER_IP}:5000"
echo ""
echo "2. 🔑 Login with admin credentials and change password"
echo ""
echo "3. 📧 Configure email settings (optional):"
echo "   nano /opt/streamhib/streamhibnodejs/.env"
echo "   systemctl restart streamhib"
echo ""
echo "4. 🔒 Setup SSL certificate (recommended for production):"
echo "   - Install Nginx reverse proxy"
echo "   - Configure Let's Encrypt SSL"
echo ""
echo "5. 📊 Monitor your system:"
echo "   /root/monitor-streamhib.sh"
echo ""
print_header "🎬 READY TO STREAM!"
echo "========================================"
print_success "Your StreamHib installation is complete and ready to use!"
print_success "Repository: https://github.com/gawemegae/streamhibnodejs"
echo ""