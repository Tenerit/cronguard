#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CronGuard — Bash SDK
# Source ce fichier dans ton script : source /usr/local/lib/cronguard.sh
#
# Variables d'environnement :
#   CRONGUARD_URL   (défaut: https://api.cronguard.io)
#
# Usage :
#   source /usr/local/lib/cronguard.sh
#
#   cg_start "ma-ping-key"           # Démarre le timer
#   ... ton code ...
#   cg_end                            # Envoie success ou fail selon $?
#
#   Ou tout-en-un :
#   cg_run "ma-ping-key" /scripts/backup.sh
#
# ─────────────────────────────────────────────────────────────────────────────

CRONGUARD_URL="${CRONGUARD_URL:-https://api.cronguard.io}"
_CG_PING_KEY=""
_CG_START_TIME=""
_CG_OUTPUT_FILE=""

# ── cg_start : démarre le chrono, capture stdout/stderr ──────────────────────
cg_start() {
  _CG_PING_KEY="$1"
  _CG_START_TIME=$(date +%s%3N)           # ms depuis epoch
  _CG_OUTPUT_FILE=$(mktemp /tmp/cg_XXXXX)
}

# ── cg_end : envoie le ping avec le statut du dernier exit code ───────────────
# Usage: cg_end [records] [exit_code_override]
cg_end() {
  local records="${1:-}"
  local exit_code="${2:-$?}"           # Capture $? avant qu'il soit écrasé
  local end_time
  end_time=$(date +%s%3N)
  local duration_ms=$(( end_time - _CG_START_TIME ))

  local output=""
  if [[ -f "$_CG_OUTPUT_FILE" ]]; then
    # Tronque les logs à 3000 chars, échappe les guillemets
    output=$(tail -c 3000 "$_CG_OUTPUT_FILE" | python3 -c \
      "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
    rm -f "$_CG_OUTPUT_FILE"
  fi

  if [[ "$exit_code" -eq 0 ]]; then
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"success\",\"exit_code\":0,\"duration_ms\":$duration_ms$([ -n "$records" ] && echo ",\"records\":$records")}"
  else
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"fail\",\"exit_code\":$exit_code,\"duration_ms\":$duration_ms,\"output\":$output}"
  fi
}

# ── cg_run : exécute une commande et gère le monitoring automatiquement ───────
# Usage: cg_run "ping-key" /chemin/vers/script.sh [args...]
# Usage: cg_run "ping-key" --records-from="SELECT COUNT(*) FROM..." commande
cg_run() {
  local ping_key="$1"; shift
  local records=""

  # Option --records-from="requete sql"
  if [[ "$1" == --records-from=* ]]; then
    local query="${1#*=}"; shift
    records=$(psql "$DATABASE_URL" -t -c "$query" 2>/dev/null | tr -d ' \n')
  fi

  cg_start "$ping_key"

  # Exécute la commande en capturant stdout + stderr
  "$@" > "$_CG_OUTPUT_FILE" 2>&1
  local exit_code=$?

  cg_end "$records" "$exit_code"
  return $exit_code
}

# ── cg_ping_success / cg_ping_fail : appels manuels simples ──────────────────
cg_ping_success() {
  local ping_key="$1"
  local records="${2:-}"
  _cg_ping "$ping_key" \
    "{\"status\":\"success\"$([ -n "$records" ] && echo ",\"records\":$records")}"
}

cg_ping_fail() {
  local ping_key="$1"
  local exit_code="${2:-1}"
  local message="${3:-}"
  local escaped
  escaped=$(echo "$message" | python3 -c \
    "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  _cg_ping "$ping_key" \
    "{\"status\":\"fail\",\"exit_code\":$exit_code,\"output\":$escaped}"
}

# ── Interne ───────────────────────────────────────────────────────────────────
_cg_ping() {
  curl -s -m 5 -X POST \
    -H "Content-Type: application/json" \
    -d "$2" \
    "${CRONGUARD_URL}/ping/$1" \
    > /dev/null 2>&1 || true   # Silencieux — ne jamais bloquer le job
}

# ─────────────────────────────────────────────────────────────────────────────
# EXEMPLES D'UTILISATION
# ─────────────────────────────────────────────────────────────────────────────
#
# ── Exemple 1 : wrapper automatique ──────────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_run "backup-key" /scripts/backup.sh
#
# ── Exemple 2 : avec comptage de records ─────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_run "sync-key" \
#     --records-from="SELECT COUNT(*) FROM synced_items WHERE date=CURRENT_DATE" \
#     python3 /scripts/sync.py
#
# ── Exemple 3 : contrôle manuel ──────────────────────────────────────────────
#   #!/bin/bash
#   source /usr/local/lib/cronguard.sh
#   cg_start "etl-key"
#
#   RESULT=$(python3 etl.py 2>&1)
#   EXIT=$?
#
#   if [ $EXIT -eq 0 ]; then
#     RECORDS=$(echo "$RESULT" | grep "Processed:" | awk '{print $2}')
#     cg_end "$RECORDS" 0
#   else
#     echo "$RESULT" > "$_CG_OUTPUT_FILE"
#     cg_end "" $EXIT
#   fi
#
# ── Exemple 4 : crontab direct ───────────────────────────────────────────────
#   0 2 * * * source /usr/local/lib/cronguard.sh && cg_run "backup-key" /scripts/backup.sh
