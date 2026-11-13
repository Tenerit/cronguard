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
#   ./cronguard-import.sh --systemd [--apply] [x.timer …]          # timers systemd
#   ./cronguard-import.sh --no-ai                                  # noms du code seulement
#
# Noms : si le serveur a un modèle d'explication local (LLM_EXPLAIN_MODEL), il propose un nom et
# un rôle pour chaque job ; le planning est toujours écrit par le code. Relisez l'aperçu avant --apply.
#
# --systemd : un monitor par timer activé (ou ceux nommés). Affiche un script à relire puis
# lancer en root, qui ajoute un drop-in ExecStopPost= au service (cg_systemd_report) : la
# commande du service n'est pas touchée. OnCalendar courant → cron ; sinon (OnUnitActiveSec,
# pas de 15 min…) → fenêtre de grâce = 1,5 × l'intervalle. Timers système seulement (pas --user).
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

apply=0; system=0; systemd=0; ai=1; src=""; timers=()
for arg in "$@"; do
  case "$arg" in
    --apply)   apply=1 ;;
    --system)  system=1 ;;
    --systemd) systemd=1 ;;
    --no-ai)   ai=0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *.timer)   timers+=("$arg") ;;
    *) src="$arg" ;;
  esac
done

if [[ $apply -eq 1 && -z "${CRONGUARD_API_KEY:-}" ]]; then
  echo "CRONGUARD_API_KEY manquant (clé owner, admin ou member)" >&2; exit 1
fi

json_str() {   # échappe une chaîne pour JSON (\ " et caractères de contrôle courants)
  local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\t'/\\t}"; s="${s//$'\n'/\\n}"; s="${s//$'\r'/\\r}"
  printf '"%s"' "$s"
}

script_of() {   # script appelé par la commande (après VAR=, sudo, interpréteur), s'il est lisible ici
  local w words
  read -ra words <<<"$1"
  for w in "${words[@]}"; do
    case "$w" in *=*|sudo|nice|nohup|time|env|bash|sh|dash|python|python3|php|perl|node|ruby|/usr/bin/env|-*) continue ;; esac
    w="${w/#\~/$HOME}"
    if [[ -f "$w" && -r "$w" ]] && grep -qI . "$w" 2>/dev/null; then printf '%s' "$w"; fi   # binaire : rien à lire
    return 0   # set -e : un script absent d'ici n'arrête pas l'import
  done
  return 0
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

create_monitor() {   # $1 nom, $2 JSON des champs de planning → ping_key sur stdout, vide si échec
  local body resp code
  body="{\"name\":$(json_str "$1"),$2,\"env\":$(json_str "$CRONGUARD_ENV")}"
  resp="$(curl -sS -X POST "$CRONGUARD_URL/monitors" -H 'Content-Type: application/json' \
    -H "X-API-Key: $CRONGUARD_API_KEY" -d "$body" -w $'\n%{http_code}' || true)"
  code="${resp##*$'\n'}"; resp="${resp%$'\n'*}"
  if [[ "$code" != 201 ]]; then echo "✗ $1 : HTTP $code $resp" >&2; return 0; fi
  local key; key="$(printf '%s' "$resp" | sed -n 's/.*"ping_key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  [[ -z "$key" ]] && echo "✗ $1 : monitor créé mais ping_key absente de la réponse : $resp" >&2
  printf '%s' "$key"
}

# ── Timers systemd ────────────────────────────────────────────────────────────
cal_to_cron() {   # forme normalisée par systemd → cron 5 champs ; rien si non traduisible
  local re='^(([A-Z][a-z]{2}((\.\.|,)[A-Z][a-z]{2})*) )?\*-\*-(\*|[0-9]{2}) (\*|[0-9]{2}):(\*|[0-9]{2}):00$'
  [[ "$1" =~ $re ]] || return 0
  local dow="${BASH_REMATCH[2]:-*}" dom="${BASH_REMATCH[5]}" h="${BASH_REMATCH[6]}" m="${BASH_REMATCH[7]}"
  [[ "$dom" != '*' ]] && dom=$((10#$dom)); [[ "$h" != '*' ]] && h=$((10#$h)); [[ "$m" != '*' ]] && m=$((10#$m))
  dow="$(printf '%s' "$dow" | sed 's/\.\./-/g;s/Sun/0/g;s/Mon/1/g;s/Tue/2/g;s/Wed/3/g;s/Thu/4/g;s/Fri/5/g;s/Sat/6/g')"
  printf '%s %s %s * %s' "$m" "$h" "$dom" "$dow"
}

span_to_s() {     # « 1h 30min », « 15min », « 1d » (format systemctl show) → secondes
  local total=0 n u tok
  for tok in $1; do
    [[ "$tok" =~ ^([0-9]+)(us|ms|s|min|h|d|w|month|y)$ ]] || continue
    n=${BASH_REMATCH[1]}; u=${BASH_REMATCH[2]}
    case "$u" in us|ms) ;; s) total=$((total+n));; min) total=$((total+n*60));; h) total=$((total+n*3600));;
      d) total=$((total+n*86400));; w) total=$((total+n*604800));; month) total=$((total+n*2629800));; y) total=$((total+n*31557600));; esac
  done
  echo "$total"
}

cal_interval_s() { # intervalle entre deux déclenchements d'une expression OnCalendar
  local a b
  a="$(systemd-analyze calendar --iterations=2 "$1" 2>/dev/null | sed -n 's/^ *Next elapse: *//p' | head -1 || true)"
  b="$(systemd-analyze calendar --iterations=2 "$1" 2>/dev/null | sed -n 's/^ *Iter\. #2: *//p' | head -1 || true)"
  [[ -n "$a" && -n "$b" ]] || { echo 0; return; }
  echo $(( $(date -d "$b" +%s) - $(date -d "$a" +%s) ))
}

if [[ $systemd -eq 1 ]]; then
  command -v systemctl >/dev/null || { echo "systemctl introuvable : pas de systemd ici." >&2; exit 1; }
  if [[ ${#timers[@]} -eq 0 ]]; then
    mapfile -t timers < <(systemctl list-unit-files --type=timer --state=enabled --no-legend --plain 2>/dev/null | awk '{print $1}')
  fi
  [[ ${#timers[@]} -eq 0 ]] && { echo "Aucun timer activé." >&2; exit 1; }
  script="#!/bin/sh"$'\n'"# Relire, puis lancer en root. Ajoute un drop-in par service ; la commande n'est pas modifiée."$'\n'"set -e"$'\n'
  n_ok=0
  for timer in "${timers[@]}"; do
    service="$(systemctl show -P Unit "$timer" 2>/dev/null || true)"
    [[ -z "$service" ]] && { echo "✗ $timer : service introuvable" >&2; continue; }
    dropin="/etc/systemd/system/$service.d/cronguard.conf"
    [[ -e "$dropin" ]] && { echo "· $timer : déjà surveillé ($dropin)" >&2; continue; }
    name="$(printf '%s' "${timer%.timer}" | tr -c 'A-Za-z0-9_.-' '-' | cut -c1-60)"
    mapfile -t cals < <(systemctl show -P TimersCalendar "$timer" 2>/dev/null | grep -oE 'OnCalendar=[^;]*' | sed 's/^OnCalendar=//;s/[[:space:]]*$//')
    mono="$(systemctl show -P TimersMonotonic "$timer" 2>/dev/null | grep -oE 'On(UnitActive|UnitInactive|Active|Boot|Startup)USec=[^;]*' | grep -E '^OnUnit' | head -1 | sed 's/^[^=]*=//;s/[[:space:]]*$//' || true)"
    sched=""; every=0
    if [[ ${#cals[@]} -eq 1 ]]; then sched="$(cal_to_cron "${cals[0]}")"; [[ -z "$sched" ]] && every="$(cal_interval_s "${cals[0]}")"
    elif [[ ${#cals[@]} -gt 1 ]]; then every="$(cal_interval_s "${cals[0]}")"   # shortcut: plusieurs OnCalendar → intervalle du premier ; ajuster dans le dashboard
    elif [[ -n "$mono" ]]; then every="$(span_to_s "$mono")"; fi
    if [[ -n "$sched" ]]; then fields="\"schedule\":$(json_str "$sched")"; desc="$sched"
    elif [[ "$every" -gt 0 ]]; then
      grace=$(( every * 3 / 2 )); (( grace < 60 )) && grace=60
      (( grace > 86400 )) && { grace=86400; echo "! $timer : intervalle > 16 h, retard détecté au bout de 24 h seulement" >&2; }
      fields="\"grace_period\":$grace"; desc="grâce ${grace}s"
    else echo "✗ $timer : planning non lu (${cals[*]:-}${mono:-vide}), ignoré" >&2; continue; fi

    key="<ping-key-$name>"
    if [[ $apply -eq 1 ]]; then key="$(create_monitor "$name" "$fields")"; [[ -z "$key" ]] && continue; fi
    echo "✓ $timer → $service ($desc)" >&2
    n_ok=$((n_ok+1))
    script+="mkdir -p '/etc/systemd/system/$service.d'"$'\n'
    script+="cat > '$dropin' <<'CRONGUARD'"$'\n'"[Service]"$'\n'"Environment=CRONGUARD_URL=$CRONGUARD_URL"$'\n'
    script+="ExecStopPost=/bin/bash -c 'source $CRONGUARD_LIB && cg_systemd_report $key %n'"$'\n'"CRONGUARD"$'\n'
  done
  script+="systemctl daemon-reload"$'\n'
  echo "# ── Script à relire puis lancer en root (sudo sh) ─────────────" >&2
  printf '%s' "$script"
  if [[ $apply -eq 1 ]]; then echo "# $n_ok monitor(s) créé(s)." >&2
  else echo "# Aperçu seulement : relancez avec --apply pour créer les monitors." >&2; fi
  exit 0
fi

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

  name="$(job_name "$rest")"; role=""; when="$sched"; crit=""
  # Nom proposé par l'IA locale du serveur (si déclarée), planning écrit par le code. Nom limité à [a-z0-9-].
  if [[ $ai -eq 1 && -n "${CRONGUARD_API_KEY:-}" ]]; then
    sug="$(curl -sS -m 60 -X POST "$CRONGUARD_URL/monitors/suggest-name" -H 'Content-Type: application/json' -H "X-API-Key: $CRONGUARD_API_KEY" -d "{\"command\":$(json_str "$rest"),\"schedule\":$(json_str "$sched")}" 2>/dev/null || true)"
    field() { printf '%s' "$sug" | grep -o "\"$1\":\"[^\"]*\"" | head -1 | sed "s/^\"$1\":\"//; s/\"\$//" || true; }
    ai_name="$(field name)"; role="$(field role)"; w="$(field when)"
    [[ "$ai_name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] && name="$ai_name"
    [[ -n "$w" ]] && when="$w"
    [[ "$sug" == *'"critical":true'* ]] && crit=" ⚑ critique"
  fi
  if [[ -n "${seen[$name]:-}" ]]; then seen[$name]=$(( ${seen[$name]} + 1 )); name="$name-${seen[$name]}"; else seen[$name]=1; fi

  # Prévention : risques connus de la commande (%, -p espacé, syntaxe bash sous sh…) et du script qu'elle lance
  # (-it, ~ entre guillemets, chemins relatifs…), avant toute panne. Le serveur lit le script et ne le garde pas.
  if [[ -n "${CRONGUARD_API_KEY:-}" ]]; then
    sf="$(script_of "$rest")"; sbody=""
    [[ -n "$sf" ]] && sbody=",\"script\":$(json_str "$(head -c 50000 "$sf")"),\"scriptPath\":$(json_str "$sf")"
    lint="$(curl -sS -m 10 -X POST "$CRONGUARD_URL/monitors/lint" -H 'Content-Type: application/json' \
      -H "X-API-Key: $CRONGUARD_API_KEY" -d "{\"command\":$(json_str "$rest")$sbody}" 2>/dev/null || true)"
    while IFS= read -r risk; do
      if [[ -n "$risk" ]]; then echo "  ⚠ $name : $risk" >&2; fi
    done < <(printf '%s' "$lint" | grep -o '"cause":"[^"]*"' | sed 's/^"cause":"//; s/"$//' || true)
  fi

  key="<ping-key-$name>"
  if [[ $apply -eq 1 ]]; then
    key="$(create_monitor "$name" "\"schedule\":$(json_str "$sched")")"
    if [[ -z "$key" ]]; then out+="$line"$'\n'; continue; fi
    created=$((created+1))
    echo "✓ $name — ${role:+$role — }$when$crit" >&2
  else
    echo "• $name — ${role:+$role — }$when$crit" >&2
  fi

  # La commande d'origine passe en $0, un seul niveau d'apostrophes : ' → '\''
  q="${rest//\'/\'\\\'\'}"
  out+="$sched${user:+ $user} CRONGUARD_URL=$CRONGUARD_URL bash -c 'source $CRONGUARD_LIB && cg_run $key \"\${SHELL:-/bin/sh}\" -c \"\$0\"' '$q'"$'\n'
done <<<"$input"

echo "# ── Crontab à recoller (crontab -e) ─────────────────────────────" >&2
printf '%s' "$out"
if [[ $apply -eq 1 ]]; then echo "# $created monitor(s) créé(s), $skipped déjà enveloppé(s)." >&2
else echo "# Aperçu seulement : relancez avec --apply pour créer les monitors." >&2; fi
