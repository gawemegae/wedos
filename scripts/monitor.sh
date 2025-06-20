#!/bin/bash

# StreamHib Monitoring Script
# Shows system status, logs, and health checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Node.js Process
print_header "📱 Node.js Process"
NODE_PROCESSES=$(ps aux | grep "node server.js" | grep -v grep | wc -l)
if [ $NODE_PROCESSES -gt 0 ]; then
    print_status "✅ Node.js processes running: $NODE_PROCESSES"
    ps aux | grep "node server.js" | grep -v grep | awk '{printf "   PID: %s, CPU: %s%%, MEM: %s%%\n", $2, $3, $4}'
else
    print_error "❌ No Node.js processes found"
fi
echo ""

# Active Streaming Sessions
print_header "🎥 Active Streaming Sessions"
STREAM_SERVICES=$(sudo systemctl list-units --type=service --state=running | grep "stream-" | wc -l)
if [ $STREAM_SERVICES -gt 0 ]; then
    print_status "✅ Active streaming sessions: $STREAM_SERVICES"
    sudo systemctl list-units --type=service --state=running | grep "stream-" | awk '{print "   " $1}'
else
    print_status "ℹ️  No active streaming sessions"
fi
echo ""

# FFmpeg Processes
print_header "🎬 FFmpeg Processes"
FFMPEG_PROCESSES=$(ps aux | grep ffmpeg | grep -v grep | wc -l)
if [ $FFMPEG_PROCESSES -gt 0 ]; then
    print_status "✅ FFmpeg processes running: $FFMPEG_PROCESSES"
    ps aux | grep ffmpeg | grep -v grep | awk '{printf "   PID: %s, CPU: %s%%, MEM: %s%%\n", $2, $3, $4}' | head -5
else
    print_status "ℹ️  No FFmpeg processes running"
fi
echo ""

# Nginx Status (if installed)
print_header "🌐 Nginx Status"
if command -v nginx >/dev/null 2>&1; then
    if sudo systemctl is-active --quiet nginx; then
        print_status "✅ Nginx is RUNNING"
    else
        print_warning "⚠️  Nginx is installed but NOT RUNNING"
    fi
else
    print_status "ℹ️  Nginx is not installed"
fi
echo ""

# Disk Space Check
print_header "💾 Storage Status"
STREAMHIB_DIR="$HOME/streamhib/StreamHib-NodeJS"
if [ -d "$STREAMHIB_DIR" ]; then
    VIDEO_SIZE=$(du -sh "$STREAMHIB_DIR/videos" 2>/dev/null | awk '{print $1}' || echo "0B")
    LOG_SIZE=$(du -sh "$STREAMHIB_DIR/logs" 2>/dev/null | awk '{print $1}' || echo "0B")
    DATA_SIZE=$(du -sh "$STREAMHIB_DIR/data" 2>/dev/null | awk '{print $1}' || echo "0B")
    
    print_status "📁 Videos directory: $VIDEO_SIZE"
    print_status "📄 Logs directory: $LOG_SIZE"
    print_status "💾 Data directory: $DATA_SIZE"
    
    # Check video count
    VIDEO_COUNT=$(find "$STREAMHIB_DIR/videos" -type f \( -name "*.mp4" -o -name "*.mkv" -o -name "*.avi" -o -name "*.mov" \) 2>/dev/null | wc -l)
    print_status "🎥 Video files: $VIDEO_COUNT"
else
    print_warning "⚠️  StreamHib directory not found"
fi
echo ""

# Recent Logs
print_header "📋 Recent Logs (Last 10 lines)"
if sudo journalctl -u streamhib -n 10 --no-pager -q 2>/dev/null; then
    echo ""
else
    print_warning "⚠️  Unable to read service logs"
fi

# Network Connections
print_header "🌐 Network Connections"
CONNECTIONS=$(netstat -tn 2>/dev/null | grep ":5000" | wc -l)
if [ $CONNECTIONS -gt 0 ]; then
    print_status "🔗 Active connections to port 5000: $CONNECTIONS"
else
    print_status "ℹ️  No active connections to port 5000"
fi
echo ""

# Quick Actions Menu
print_header "🛠️  Quick Actions"
echo "1. View real-time logs"
echo "2. Restart StreamHib service"
echo "3. Check service status"
echo "4. View error logs"
echo "5. Show active streams"
echo "6. System resource usage"
echo "7. Exit"
echo ""

read -p "Choose an action (1-7): " choice

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
        print_status "Showing error logs..."
        sudo journalctl -u streamhib -p err -n 20 --no-pager
        ;;
    5)
        print_status "Active streaming services:"
        sudo systemctl list-units --type=service --state=running | grep "stream-"
        ;;
    6)
        print_status "System resource usage:"
        htop
        ;;
    7)
        print_status "Goodbye!"
        exit 0
        ;;
    *)
        print_warning "Invalid choice"
        ;;
esac