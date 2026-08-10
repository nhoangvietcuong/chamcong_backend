#!/bin/bash

# Configuration
BACKUP_DIR="/app/backups"
DB_NAME="CHAM_CONG"
DB_USER="postgres"
DB_HOST="db"
DB_PORT="5432"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Generate backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"

echo "--------------------------------------------------"
echo "📅 Starting Database Backup at $(date)"
echo "--------------------------------------------------"

# Run pg_dump and compress on-the-fly
# PGPASSWORD should be set as an environment variable or loaded from Docker secrets
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    echo "✅ Backup successfully created: $BACKUP_FILE"
    echo "Size: $(du -sh "$BACKUP_FILE" | cut -f1)"
else
    echo "❌ Backup failed!" >&2
    exit 1
fi

# Clean up backups older than RETENTION_DAYS
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "${DB_NAME}_backup_*.sql.gz" -mtime +$RETENTION_DAYS -exec rm -f {} \; -print
echo "Done."
echo "--------------------------------------------------"
