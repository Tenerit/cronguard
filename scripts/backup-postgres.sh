#!/usr/bin/env bash
# ─── backup-postgres.sh ───────────────────────────────────────────────────────
# Backup automatique PostgreSQL vers un dossier local ou S3.
# À exécuter via cron ou comme service Docker.
#
# Variables d'env requises :
#   DATABASE_URL       — postgres://user:pass@host:5432/db
#   BACKUP_DIR         — répertoire local (défaut: /backups)
#   BACKUP_S3_BUCKET   — optionnel: s3://mon-bucket/cronguard-backups
#   BACKUP_KEEP_DAYS   — nombre de jours de rétention locale (défaut: 7)
#   CRONGUARD_PING_KEY — optionnel: ping key CronGuard pour ce job

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="cronguard_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

log "Starting backup: $FILENAME"

# ── Dump + compression ────────────────────────────────────────────────────────
START_TIME=$(date +%s)
pg_dump "$DATABASE_URL" | gzip > "$FILEPATH"
DURATION=$(( $(date +%s) - START_TIME ))
SIZE=$(du -sh "$FILEPATH" | cut -f1)

log "Dump complete: ${SIZE} in ${DURATION}s"

# ── Upload S3 (optionnel) ──────────────────────────────────────────────────────
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  log "Uploading to S3..."
  aws s3 cp "$FILEPATH" "${BACKUP_S3_BUCKET}/${FILENAME}" \
    --storage-class STANDARD_IA \
    --no-progress
  log "S3 upload complete"
fi

# ── Nettoyage fichiers anciens ────────────────────────────────────────────────
find "$BACKUP_DIR" -name "cronguard_*.sql.gz" -mtime "+${BACKUP_KEEP_DAYS}" -delete
REMAINING=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
log "Cleanup done: ${REMAINING} backups retained"

# ── Ping CronGuard (si configuré) ─────────────────────────────────────────────
if [[ -n "${CRONGUARD_PING_KEY:-}" ]]; then
  CRONGUARD_URL="${CRONGUARD_URL:-http://localhost:3000}"
  curl -sf -X POST "${CRONGUARD_URL}/ping/${CRONGUARD_PING_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"success\",\"duration_ms\":$((DURATION*1000))}" \
    > /dev/null && log "CronGuard pinged"
fi

log "Backup complete: $FILEPATH"
