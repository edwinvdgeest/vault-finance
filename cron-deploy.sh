#!/bin/bash
# Auto-deploy script for Synology NAS
# Run via Task Scheduler or manually: ./cron-deploy.sh

set -euo pipefail

APP_DIR="/volume1/docker/vault-finance"
LOG_FILE="$APP_DIR/deploy.log"
BRANCH="main"

cd "$APP_DIR"

# Ensure we're on the right branch and fetch latest
git fetch origin "$BRANCH" 2>&1

BEFORE=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$BEFORE" = "$REMOTE" ]; then
  # No changes — exit quietly (exit code 0, no log noise)
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S'): Changes detected — deploying..." >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S'):   Before: $BEFORE" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S'):   After:  $REMOTE" >> "$LOG_FILE"

# Pull and rebuild
git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

if docker-compose up -d --build 2>&1 | tee -a "$LOG_FILE"; then
  AFTER=$(git rev-parse HEAD)
  echo "$(date '+%Y-%m-%d %H:%M:%S'): Deployed successfully — $AFTER" >> "$LOG_FILE"
  exit 0
else
  echo "$(date '+%Y-%m-%d %H:%M:%S'): ERROR — docker-compose build/start failed" >> "$LOG_FILE"
  exit 1
fi
