#!/bin/bash

# Nginx Reverse Proxy Setup Script for StreamHib Node.js
# Run this after main installation

set -e

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

print_header "🌐 StreamHib Nginx Reverse Proxy Setup"
echo "========================================"

# Get domain name
echo "Enter your domain name (e.g., streamhib.yourdomain.com):"
read -r DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    print_error "Domain name is required!"
    exit 1
fi

print_status "Setting up Nginx reverse proxy for: $DOMAIN_NAME"

print_header "Step 1: Installing Nginx"
sudo apt update
sudo apt install -y nginx

print_header "Step 2: Creating Nginx Configuration"
sudo tee /etc/nginx/sites-available/streamhib > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Increase client max body size for video uploads
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Increase timeouts for long streaming sessions
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 86400s;
    }

    # Handle Socket.IO connections
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Serve static files directly
    location /static/ {
        alias /home/$USER/streamhib/streamhibnodejs/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Handle video files
    location /videos/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Increase buffer sizes for video streaming
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
EOF

print_header "Step 3: Enabling Site"
sudo ln -sf /etc/nginx/sites-available/streamhib /etc/nginx/sites-enabled/

# Remove default site if exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    print_status "Removed default Nginx site"
fi

print_header "Step 4: Testing Nginx Configuration"
if sudo nginx -t; then
    print_status "✅ Nginx configuration is valid"
else
    print_error "❌ Nginx configuration has errors"
    exit 1
fi

print_header "Step 5: Starting Nginx"
sudo systemctl enable nginx
sudo systemctl restart nginx

if sudo systemctl is-active --quiet nginx; then
    print_status "✅ Nginx is running"
else
    print_error "❌ Nginx failed to start"
    exit 1
fi

print_header "Step 6: Firewall Configuration"
sudo ufw allow 'Nginx Full'
print_status "Added Nginx firewall rules"

print_header "Step 7: SSL Certificate Setup (Optional)"
print_warning "Do you want to install SSL certificate with Let's Encrypt? (y/N)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    print_status "Installing Certbot..."
    sudo apt install -y certbot python3-certbot-nginx
    
    print_status "Generating SSL certificate for $DOMAIN_NAME..."
    sudo certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME
    
    print_status "Setting up auto-renewal..."
    sudo systemctl enable certbot.timer
    
    # Test renewal
    print_status "Testing certificate renewal..."
    sudo certbot renew --dry-run
    
    print_status "✅ SSL certificate installed successfully!"
fi

print_header "Step 8: Updating StreamHib Configuration"
# Update BASE_URL in .env file
STREAMHIB_DIR="$HOME/streamhib/streamhibnodejs"
if [ -f "$STREAMHIB_DIR/.env" ]; then
    if [[ "$response" =~ ^[Yy]$ ]]; then
        # HTTPS
        sed -i "s|BASE_URL=.*|BASE_URL=https://$DOMAIN_NAME|" "$STREAMHIB_DIR/.env"
        print_status "Updated BASE_URL to https://$DOMAIN_NAME"
    else
        # HTTP
        sed -i "s|BASE_URL=.*|BASE_URL=http://$DOMAIN_NAME|" "$STREAMHIB_DIR/.env"
        print_status "Updated BASE_URL to http://$DOMAIN_NAME"
    fi
    
    # Restart StreamHib service
    sudo systemctl restart streamhib
    print_status "Restarted StreamHib service"
fi

print_header "🎉 Nginx Setup Complete!"
echo "========================================"
print_status "Nginx reverse proxy has been configured successfully!"
echo ""
if [[ "$response" =~ ^[Yy]$ ]]; then
    print_status "🌐 Your StreamHib is now available at: https://$DOMAIN_NAME"
    print_status "🔒 SSL certificate is active and will auto-renew"
else
    print_status "🌐 Your StreamHib is now available at: http://$DOMAIN_NAME"
    print_warning "⚠️  Consider adding SSL certificate for production use"
fi
echo ""
print_status "📋 Nginx status: sudo systemctl status nginx"
print_status "📄 Nginx logs: sudo tail -f /var/log/nginx/access.log"
print_status "🔧 Nginx config: /etc/nginx/sites-available/streamhib"
echo ""
print_status "Setup completed successfully! 🚀"