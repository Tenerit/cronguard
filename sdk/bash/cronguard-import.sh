#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CronGuard — import d'une crontab
#
# Lit une crontab, crée un monitor par job et affiche la crontab à recoller,
# chaque commande enveloppée par cg_run (ping + logs + code de sortie).
# Ne modifie JAMAIS la crontab : c'est vous qui recollez le résultat.
#
# Usage :
#   CRONGUARD_API_KEY=cg_live_... ./cronguard-import.sh            # aperçu (crontab -l)
#   CRONGUARD_API_KEY=cg_live_... ./cronguard-import.sh --apply    # crée les monitors
#   ./cronguard-import.sh --apply /etc/cron.d/backups              # depuis un fichier
#
# Variables : CRONGUARD_URL (défaut http://localhost:3000), CRONGUARD_API_KEY,
#             CRONGUARD_ENV (production|staging|development, défaut production),
#             CRONGUARD_LIB (chemin du SDK, défaut /usr/local/lib/cronguard.sh)
#
# shortcut: crontab utilisateur et fichiers au même format seulement ; /etc/crontab et
# /etc/cron.d ont une colonne « user » en plus (détectée si --system), pas les timers systemd.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CRONGUARD_URL="${CRONGUARD_URL:-http://localhost:3000}"
CRONGUARD_ENV="${CRONGUARD_ENV:-production}"
CRONGUARD_LIB="${CRONGUARD_LIB:-/usr/local/lib/cronguard.sh}"

apply=0; system=0; src=""
for arg in "$@"; do
  case "$arg" in
    --apply)  apply=1 ;;
    --system) system=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) src="$arg" ;;
  esac
done

if [[ $apply -eq 1 && -z "${CRONGUARD_API_KEY:-}" ]]; then
  echo "CRONGUARD_API_KEY manquant (clé owner, admin ou member)" >&2; exit 1
fi

json_str() {   # échappe une chaîne pour JSON (\ " et caractères de contrôle courants)
  local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

job_name() {   # nom lisible : premier exécutable significatif de la commande
  local word base="" words skip=0
  read -ra words <<<"$1"   # read -a : pas d'expansion des * en noms de fichiers
  for word in "${words[@]}"; do
    if [[ $skip -eq 1 ]]; then skip=0; continue; fi
    if [[ "$word" == cd ]]; then skip=1; continue; fi   # le dossier de cd n'est pas le job
    case "$word" in
      *=*|-*|'&&'|'||'|';'|'|'|'>'*|'<'*|'2>'*|cd|sudo|nice|ionice|flock|timeout|env|bash|sh|python*|node|php|/usr/bin/env) continue ;;
    esac
    base="$(basename -- "$word")"; break
  done
  base="${base%.*}"
  base="$(printf '%s' "${base:-job}" | tr -c 'A-Za-z0-9_.-' '-' | cut -c1-60)"
  printf '%s' "${base%-}"
}

if [[ -n "$src" ]]; then input="$(cat -- "$src")"; else input="$(crontab -l 2>/dev/null || true)"; fi
if [[ -z "$input" ]]; then echo "Crontab vide ou illisible." >&2; exit 1; fi

declare -A seen=()
out=""; created=0; skipped=0

while IFS= read -r line || [[ -n "$line" ]]; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  # Commentaires, lignes vides, variables (MAILTO=…) et @reboot : recopiés tels quels.
  if [[ -z "$trimmed" || "$trimmed" == \#* || "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= || "$trimmed" == @reboot* ]]; then
    out+="$line"$'\n'; continue
  fi
  # Déjà enveloppée : ne pas doubler.
  if [[ "$trimmed" == *cg_run* ]]; then out+="$line"$'\n'; skipped=$((skipped+1)); continue; fi

  if [[ "$trimmed" == @* ]]; then
    sched="${trimmed%%[[:space:]]*}"; rest="${trimmed#"$sched"}"
  else
    [[ "$trimmed" =~ ^(([^[:space:]]+[[:space:]]+){5})(.*)$ ]] || { out+="$line"$'
'; continue; }
    read -r -a f <<<"${BASH_REMATCH[1]}"
    sched="${f[*]}"
    rest="${BASH_REMATCH[3]}"
  fi
  rest="${rest#"${rest%%[![:space:]]*}"}"
  user=""
  if [[ $system -eq 1 ]]; then user="${rest%%[[:space:]]*}"; rest="${rest#"$user"}"; rest="${rest#"${rest%%[![:space:]]*}"}"; fi
  [[ -z "$rest" ]] && { out+="$line"$'\n'; continue; }

  name="$(job_name "$rest")"
  if [[ -n "${seen[$name]:-}" ]]; then seen[$name]=$(( ${seen[$name]} + 1 )); name="$name-${seen[$name]}"; else seen[$name]=1; fi

  key="<ping-key-$name>"
  if [[ $apply -eq 1 ]]; then
    body="{\"name\":$(json_str "$name"),\"schedule\":$(json_str "$sched"),\"env\":$(json_str "$CRONGUARD_ENV")}"
    resp="$(curl -sS -X POST "$CRONGUARD_URL/monitors" -H 'Content-Type: application/json' \
      -H "X-API-Key: $CRONGUARD_API_KEY" -d "$body" -w $'\n%{http_code}')"
    code="${resp##*$'\n'}"; resp="${resp%$'\n'*}"
    if [[ "$code" != 201 ]]; then echo "✗ $name : HTTP $code $resp" >&2; out+="$line"$'\n'; continue; fi
    key="$(printf '%s' "$resp" | sed -n 's/.*"ping_key":"\([^"]*\)".*/\1/p')"
    created=$((created+1))
    echo "✓ $name ($sched)" >&2
  fi

  # La commande d'origine passe en $0, un seul niveau d'apostrophes : ' → '\''
  q="${rest//\'/\'\\\'\'}"
  out+="$sched${user:+ $user} CRONGUARD_URL=$CRONGUARD_URL bash -c 'source $CRONGUARD_LIB && cg_run $key bash -c \"\$0\"' '$q'"$'\n'
done <<<"$input"

echo "# ── Crontab à recoller (crontab -e) ─────────────────────────────" >&2
printf '%s' "$out"
if [[ $apply -eq 1 ]]; then echo "# $created monitor(s) créé(s), $skipped déjà enveloppé(s)." >&2
else echo "# Aperçu seulement : relancez avec --apply pour créer les monitors." >&2; fi
