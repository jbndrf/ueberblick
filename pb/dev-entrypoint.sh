#!/bin/sh
set -e

DIR=$(dirname $0)
cd $DIR

# Load .env from project root if it exists
ENV_FILE="../.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from .env..."
    export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

# Build the Go binary
echo "Building PocketBase..."
go build -o myapp

# Note: PocketBase auto-runs migrations on startup since v0.23+

# Create/update superuser if credentials are provided
if [ -n "$POCKETBASE_ADMIN_EMAIL" ] && [ -n "$POCKETBASE_ADMIN_PASSWORD" ]; then
    echo "Setting up admin account: $POCKETBASE_ADMIN_EMAIL"
    ./myapp superuser upsert "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" 2>/dev/null || true
fi

echo "Starting PocketBase server..."
echo "Admin UI: http://localhost:8090/_/"
echo "API: http://localhost:8090/api/"

exec ./myapp serve --dev --http 0.0.0.0:8090
