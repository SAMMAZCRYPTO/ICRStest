#!/usr/bin/env bash
set -e

DOMAIN="icrsstudio.com"
echo "=== Setting up Nginx & SSL for $DOMAIN on Hostinger VPS ==="

# 1. Install Nginx and Certbot
apt update
apt install -y nginx certbot python3-certbot-nginx

# 2. Configure Nginx Reverse Proxy
cat << 'EOF' > /etc/nginx/sites-available/icrsstudio.com
server {
    listen 80;
    listen [::]:80;
    server_name icrsstudio.com www.icrsstudio.com;

    client_max_body_size 500M;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API (FastAPI)
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
EOF

# 3. Enable site and test configuration
ln -sf /etc/nginx/sites-available/icrsstudio.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

# 4. Obtain Let's Encrypt SSL Certificate
echo "=== Obtaining Free SSL Certificate via Certbot ==="
certbot --nginx -d icrsstudio.com -d www.icrsstudio.com --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "=== Setup complete! https://$DOMAIN is now live with HTTPS ==="
