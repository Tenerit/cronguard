#!/usr/bin/env bash
# Enchaîne les A/B appariés de la phase qualité IA (2026-11-08). Chaque rapport est copié sous
# un nom à part : eval/REPORT.<nom>.md + eval/report.<nom>.json.
#   bash eval/run-phase.sh
set -uo pipefail
cd "$(dirname "$0")/.."
run() {   # nom, arguments de score.ts
  local name="$1"; shift
  echo "=== $name : $* ($(date +%H:%M))"
  npx tsx eval/score.ts "$@" > "eval/score-$name.log" 2>&1 || echo "ÉCHEC $name"
  cp eval/REPORT.md "eval/REPORT.$name.md"; cp eval/report.json "eval/report.$name.json"
  sed -n '/^{/,$p' "eval/score-$name.log" | head -40
}
# E1 : la base de connaissance (A = activée, B = désactivée = sortie brute du modèle)
run e1-knowledge --set all --runs 2 --ab LLM_KNOWLEDGE=off
# E2 : connaissance générale du cron dans le prompt (A = sans, B = avec)
run e2-cron-hints --set all --runs 2 --ab LLM_CRON_HINTS=on
# E3 : modèle 7B local (A = llama3.2:3b, B = qwen2.5:7b), déjà installé
run e3-qwen7b --set all --runs 2 --ab LLM_MODEL=qwen2.5:7b-instruct-q4_K_M
echo "=== fini $(date +%H:%M)"
