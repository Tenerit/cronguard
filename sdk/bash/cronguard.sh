#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CronGuard — Bash SDK
# Source ce fichier dans ton script : source /usr/local/lib/cronguard.sh
#
# Variables d'environnement :
#   CRONGUARD_URL   (défaut: http://localhost:3000, ton instance auto-hébergée)
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

CRONGUARD_URL="${CRONGUARD_URL:-http://localhost:3000}"
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

  local output='""' context=""          # '""' : sans fichier de sortie, le JSON reste valide
  if [[ -f "$_CG_OUTPUT_FILE" ]]; then
    # Tronque les logs à 3000 chars, échappe les guillemets
    output=$(tail -c 3000 "$_CG_OUTPUT_FILE" | python3 -c \
      "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  fi
  # La sonde lit la sortie complète : avant la suppression du fichier.
  if [[ "$exit_code" -ne 0 ]]; then context="$(_cg_context_fields)"; fi   # if, pas && : sûr sous set -e
  rm -f "$_CG_OUTPUT_FILE"

  if [[ "$exit_code" -eq 0 ]]; then
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"success\",\"exit_code\":0,\"duration_ms\":$duration_ms$([ -n "$records" ] && echo ",\"records\":$records")}"
  else
    _cg_ping "$_CG_PING_KEY" \
      "{\"status\":\"fail\",\"exit_code\":$exit_code,\"duration_ms\":$duration_ms,\"output\":$output$context}"
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
  # Commande envoyée à l'échec (vérifiée côté serveur). Forme de l'import : cg_run KEY bash -c "<cmd>".
  if [[ "${1:-}" == bash && "${2:-}" == -c ]]; then _CG_COMMAND="${3:-}"; else _CG_COMMAND="$*"; fi

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

# ── cg_systemd_report : service lancé par un timer systemd ───────────────────
# À mettre en ExecStopPost= (drop-in généré par cronguard-import.sh --systemd) :
#   ExecStopPost=/bin/bash -c 'source /usr/local/lib/cronguard.sh && cg_systemd_report <ping-key> %n'
# systemd ≥ 232 fournit SERVICE_RESULT, EXIT_STATUS et INVOCATION_ID : les logs envoyés sont
# ceux de CETTE exécution (journal filtré par invocation), pas les précédentes.
cg_systemd_report() {
  local ping_key="$1" unit="${2:-}" start end duration="" code output
  if [[ -n "$unit" ]]; then
    start=$(systemctl show -P ExecMainStartTimestampMonotonic "$unit" 2>/dev/null)
    end=$(systemctl show -P ExecMainExitTimestampMonotonic "$unit" 2>/dev/null)
    [[ "$start" =~ ^[1-9][0-9]*$ && "$end" =~ ^[1-9][0-9]*$ && $end -ge $start ]] && duration=",\"duration_ms\":$(( (end - start) / 1000 ))"
  fi
  if [[ "${SERVICE_RESULT:-success}" == success ]]; then
    _cg_ping "$ping_key" "{\"status\":\"success\",\"exit_code\":0$duration}"
    return 0
  fi
  # EXIT_STATUS vaut un nombre, ou un nom de signal (KILL, TERM…) quand le service a été tué.
  code="${EXIT_STATUS:-1}"; [[ "$code" =~ ^[0-9]+$ ]] || code=1
  output=$( { journalctl -q -o cat "_SYSTEMD_INVOCATION_ID=${INVOCATION_ID:-none}" 2>/dev/null | tail -c 2800
              echo "systemd: unit=$unit result=$SERVICE_RESULT exit_status=${EXIT_STATUS:-?}"; } | python3 -c \
    "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  _cg_ping "$ping_key" "{\"status\":\"fail\",\"exit_code\":$code$duration,\"output\":$output}"
}

# ── Interne ───────────────────────────────────────────────────────────────────
# Sonde de contexte, à l'échec seulement : l'environnement RÉEL du cron (utilisateur, HOME, PATH,
# shell, locale, DISPLAY / agent SSH présents ou non) et, pour chaque « X: not found » de la sortie,
# l'endroit où X existe sur la machine. Noms, chemins et booléens : aucune valeur secrète.
# Renvoie ',"command":…,"context":{…}' à concaténer au JSON, ou rien si python3 manque.
_cg_context_fields() {
  local out="${_CG_OUTPUT_FILE:-}"
  [[ -n "$out" ]] && command -v cygpath >/dev/null 2>&1 && out="$(cygpath -w "$out")"   # Git Bash : python Windows
  python3 - "$out" "${_CG_COMMAND:-}" 2>/dev/null <<'PY' || true
import getpass, glob, json, os, re, sys
out = open(sys.argv[1], errors='replace').read()[-20000:] if sys.argv[1] and os.path.exists(sys.argv[1]) else ''
names = list(dict.fromkeys(m.group(1) for m in re.finditer(r'(?:^|\s)([\w.+-]+): (?:command )?not found', out, re.M)))[:5]
home = os.environ.get('HOME') or os.path.expanduser('~')   # HOME du cron (Windows ignore HOME dans expanduser)
homes = list(dict.fromkeys([home, '/root'] + glob.glob('/home/*')))
dirs = ['/usr/local/bin', '/usr/local/sbin', '/usr/sbin', '/sbin', '/snap/bin', '/opt/*/bin',
        '/usr/local/rvm/bin', '/usr/local/rvm/gems/*/bin', '/usr/local/rvm/rubies/*/bin']
for h in homes:
    dirs += [h + s for s in ('/.local/bin', '/bin', '/.rvm/bin', '/.rvm/gems/*/bin', '/.nvm/versions/node/*/bin',
                             '/.pyenv/shims', '/.rbenv/shims', '/.cargo/bin', '/go/bin', '/.npm-global/bin')]
found = {}
for n in names:
    for d in dirs:
        hit = next((p for p in sorted(glob.glob(os.path.join(d, n))) if os.access(p, os.X_OK)), None)
        if hit:
            found[n] = hit
            break
try:
    user = getpass.getuser()           # USER est souvent absent sous cron
except Exception:
    user = ''
ctx = {'user': user, 'home': home, 'path': os.environ.get('PATH', ''), 'shell': os.environ.get('SHELL', ''),
       'lang': os.environ.get('LC_ALL') or os.environ.get('LANG') or '', 'cwd': os.getcwd(),
       'display': bool(os.environ.get('DISPLAY')), 'sshAgent': bool(os.environ.get('SSH_AUTH_SOCK'))}
if found:
    ctx['found'] = found
cmd = sys.argv[2][:1000]
sys.stdout.write((',"command":' + json.dumps(cmd) if cmd else '') + ',"context":' + json.dumps(ctx))
PY
}

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
