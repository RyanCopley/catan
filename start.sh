#!/bin/bash

# Convenience script to start Catan server with podman-compose
# Handles .env generation and provides helpful output

set -e

echo "========================================"
echo "  Catan Server - Quick Start"
echo "========================================"
echo ""

# Check if .env exists - REQUIRED
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo ""
    echo "You must generate environment configuration before starting."
    echo ""
    read -p "Would you like to generate .env now? (Y/n): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        ./generate-env.sh
    else
        echo ""
        echo "Cannot start without .env file."
        echo "Please run: ./generate-env.sh"
        echo ""
        exit 1
    fi
fi

echo "Starting services with podman-compose..."
echo ""

# Check if using docker or podman
if command -v podman-compose &> /dev/null; then
    COMPOSE_CMD="podman-compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Error: Neither podman-compose nor docker-compose found"
    echo "Please install one of them to continue"
    exit 1
fi

# Start services
$COMPOSE_CMD up -d

echo ""
echo "========================================"
echo "  Services Started!"
echo "========================================"
echo ""
echo "🎮 Game Server: http://localhost:3000"
echo "⚙️  Admin Panel: http://localhost:3000/admin"
echo ""

# If .env exists, show admin credentials
if [ -f ".env" ]; then
    ADMIN_USER=$(grep "^ADMIN_USERNAME=" .env | cut -d '=' -f2)
    ADMIN_PASS=$(grep "^ADMIN_PASSWORD=" .env | cut -d '=' -f2)

    echo "Admin Credentials:"
    echo "  Username: $ADMIN_USER"
    echo "  Password: $ADMIN_PASS"
    echo ""
fi

echo "Useful commands:"
echo "  $COMPOSE_CMD logs -f        # View logs"
echo "  $COMPOSE_CMD ps             # Check status"
echo "  $COMPOSE_CMD down           # Stop services"
echo "  $COMPOSE_CMD restart app    # Restart game server"
echo ""
echo "To view container logs:"
echo "  $COMPOSE_CMD logs -f app"
echo ""
