#!/bin/bash

# Script to generate .env file with secure random credentials
# This script is safe to run multiple times - it won't overwrite existing .env

set -e

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Catan Server - Environment Setup"
echo "========================================"
echo ""

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists!${NC}"
    echo ""
    read -p "Do you want to regenerate it? This will overwrite existing credentials (y/N): " -n 1 -r
    echo ""
    if [[ ! $RE =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}✅ Keeping existing .env file${NC}"
        exit 0
    fi
    echo ""
    echo -e "${YELLOW}Creating backup: .env.backup$(date +%s)${NC}"
    cp "$ENV_FILE" ".env.backup$(date +%s)"
fi

echo -e "${GREEN}Generating secure credentials...${NC}"
echo ""

# Generate secure random strings
generate_secret() {
    # Use openssl if available, fallback to /dev/urandom
    if command -v openssl &> /dev/null; then
        openssl rand -base64 "$1" | tr -d '\n'
    else
        head -c "$1" /dev/urandom | base64 | tr -d '\n'
    fi
}

# Generate SESSION_SECRET
SESSION_SECRET=$(generate_secret 32)

# Get user input for admin username (with default)
read -p "Enter admin username [admin]: " ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}

# Ask about admin password
echo ""
echo "Admin Password Options:"
echo "  1) Generate a secure random password (recommended)"
echo "  2) Set my own password"
echo ""
read -p "Choose option [1]: " PASSWORD_CHOICE
PASSWORD_CHOICE=${PASSWORD_CHOICE:-1}

if [ "$PASSWORD_CHOICE" = "2" ]; then
    while true; do
        read -sp "Enter admin password (min 8 characters): " ADMIN_PASSWORD
        echo ""

        # Check minimum length
        if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
            echo -e "${RED}❌ Password must be at least 8 characters${NC}"
            continue
        fi

        read -sp "Confirm password: " ADMIN_PASSWORD_CONFIRM
        echo ""

        if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
            echo -e "${GREEN}✅ Password set${NC}"
            break
        else
            echo -e "${RED}❌ Passwords don't match, try again${NC}"
        fi
    done
else
    ADMIN_PASSWORD=$(generate_secret 16)
    echo -e "${GREEN}✅ Generated secure password${NC}"
fi

# Get user input for port (with default)
read -p "Enter inner server port [3000]: " PORT
PORT=${PORT:-3000}

# Get user input for port (with default)
read -p "Enter external server port [3000]: " CONTAINER_PORT
CONTAINER_PORT=${CONTAINER_PORT:-3000}

# Get Redis URL
read -p "Enter Redis URL [redis://redis:6379]: " REDIS_URL
REDIS_URL=${REDIS_URL:-redis://redis:6379}

# Get allowed origins
read -p "Enter allowed origins (comma-separated) [http://localhost:3000,http://localhost:5173]: " ALLOWED_ORIGINS
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:5173}

echo ""
echo -e "${GREEN}Creating .env file...${NC}"

# Create .env file
cat > "$ENV_FILE" << EOF
# Catan Server Environment Configuration
# Generated: $(date)
# WARNING: Keep this file secure and never commit to version control!

# Server Configuration
PORT=$PORT
NODE_ENV=production

# Session Configuration (REQUIRED)
# Auto-generated secure random string
SESSION_SECRET=$SESSION_SECRET

# Admin Panel Credentials (REQUIRED)
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Redis Configuration
REDIS_URL=$REDIS_URL

# CORS Configuration
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
EOF

echo ""
echo -e "${GREEN}✅ .env file created successfully!${NC}"
echo ""
echo "========================================"
echo "  Your Admin Credentials"
echo "========================================"
echo ""
echo -e "Admin Username: ${GREEN}$ADMIN_USERNAME${NC}"

if [ "$PASSWORD_CHOICE" = "2" ]; then
    echo -e "Admin Password: ${GREEN}(you set this)${NC}"
else
    echo -e "Admin Password: ${GREEN}$ADMIN_PASSWORD${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Save this password now!${NC}"
    echo -e "${YELLOW}⚠️  This is the only time it will be displayed.${NC}"
fi

echo ""
echo "Admin Panel URL: http://localhost:$PORT/admin"
echo ""

if [ "$PASSWORD_CHOICE" != "2" ]; then
    echo -e "${YELLOW}💡 Tip: Save credentials in a secure password manager${NC}"
fi

echo "========================================"
echo ""

# Create .env.local if it doesn't exist (for local overrides)
if [ ! -f ".env.local" ]; then
    cat > ".env.local" << EOF
# Local development overrides
# This file overrides settings from .env for local development
# Automatically loaded after .env

# For local development with 'npm run dev', use localhost for Redis
# (When running with podman-compose, this file is ignored in the container)
REDIS_URL=redis://localhost:6379

# Development mode for better error messages and debugging
NODE_ENV=development

# Uncomment to override port for local dev:
# PORT=3001

# Uncomment to use different allowed origins:
# ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
EOF
    echo -e "${GREEN}✅ Created .env.local for local development${NC}"
    echo ""
    echo "💡 For local development (npm run dev):"
    echo "   - Uses .env.local (Redis at localhost:6379)"
    echo ""
    echo "💡 For containers (podman-compose):"
    echo "   - Uses .env (Redis at redis:6379)"
fi

# Update .gitignore to ensure .env files are not committed
if [ -f ".gitignore" ]; then
    if ! grep -q "^\.env$" .gitignore; then
        echo "" >> .gitignore
        echo "# Environment files - DO NOT COMMIT" >> .gitignore
        echo ".env" >> .gitignore
        echo ".env.local" >> .gitignore
        echo ".env.backup*" >> .gitignore
        echo -e "${GREEN}✅ Updated .gitignore${NC}"
    fi
else
    cat > .gitignore << EOF
# Environment files - DO NOT COMMIT
.env
.env.local
.env.backup*

# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*
EOF
    echo -e "${GREEN}✅ Created .gitignore${NC}"
fi

echo ""
echo -e "${GREEN}Setup complete! You can now start the server.${NC}"
echo ""
