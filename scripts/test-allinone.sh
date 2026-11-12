#!/usr/bin/env bash
# Test de l'image tout-en-un : démarrage, panne analysée sans IA, données conservées après
# redémarrage, arrêt propre de PostgreSQL. Usage : scripts/test-allinone.sh [image]
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash (Windows) : ne pas réécrire /data/… en chemin Windows dans docker exec
IMG="${1:-cronguard-allinone:test}"
NAME="cg-allinone-test-$$"
VOL="cg-allinone-test-$$"
PORT="${PORT:-3999}"
URL="http://127.0.0.1:$PORT"
fail() { echo "FAIL $*"; docker logs "$NAME" 2>&1 | tail -30; cleanup; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$VOL" >/dev/null 2>&1 || true; }
trap cleanup EXIT
ok() { echo "OK   $*"; }

wait_health() {
  for _ in $(seq 1 60); do curl -fsS "$URL/health" >/dev/null 2>&1 && return 0; sleep 2; done
  fail "API pas prête après 120 s"
}

docker run -d --name "$NAME" -p "$PORT:3000" -v "$VOL:/data" "$IMG" >/dev/null
wait_health
ok "démarre seul (PostgreSQL + Redis + API + workers)"
curl -fsS "$URL/health" | grep -q '"model":"none"' && ok "sans LLM configuré : model none" || fail "model attendu none"

KEY=$(curl -fsS -X POST "$URL/auth/register" -H 'Content-Type: application/json' -d '{"email":"allinone@example.invalid"}' | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
[ -n "$KEY" ] || fail "inscription"
# Le SDK servi par l'image (étape 3 du démarrage) : sinon l'import de crontab donne une commande en 404.
curl -fsS "$URL/sdk/cronguard.sh" | grep -q '^cg_run()' && ok "SDK servi par l'image (/sdk/cronguard.sh)" || fail "SDK absent de l'image"
PING=$(curl -fsS -X POST "$URL/monitors" -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"name":"nightly-backup"}' | sed -n 's/.*"ping_key":"\([^"]*\)".*/\1/p')
[ -n "$PING" ] || fail "création du monitor"
curl -fsS -X POST "$URL/ping/$PING" -H 'Content-Type: application/json' \
  -d '{"status":"fail","exit_code":2,"output":"tar: /backups/db.tar: Write error: No space left on device"}' >/dev/null || fail "ping"

for _ in $(seq 1 30); do
  AN=$(curl -fsS "$URL/dashboard/analyses" -H "X-API-Key: $KEY")
  echo "$AN" | grep -q '"disk-full"' && break; sleep 2
done
echo "$AN" | grep -q '"disk-full"' && ok "panne analysée sans IA : correction connue disk-full" || fail "analyse sans IA absente : $AN"

BK=$(docker exec "$NAME" sh -c 'ls /data/backups/*.dump 2>/dev/null | head -1')
[ -n "$BK" ] && docker exec "$NAME" pg_restore --list "$BK" | grep -q "TABLE public monitors" \
  && ok "sauvegarde au démarrage, lisible par pg_restore" || fail "sauvegarde absente ou illisible ($BK)"
# Une sauvegarde ne vaut que si elle se restaure : on la recharge dans une base à part.
docker exec "$NAME" sh -c "su-exec postgres pg_dump -h 127.0.0.1 -U cronguard -Fc -f /tmp/now.dump cronguard \
  && su-exec postgres createdb -h 127.0.0.1 -U cronguard restore_check \
  && su-exec postgres pg_restore -h 127.0.0.1 -U cronguard -d restore_check /tmp/now.dump" \
  && docker exec "$NAME" su-exec postgres psql -h 127.0.0.1 -U cronguard -d restore_check -tAc "SELECT name FROM monitors" | grep -q nightly-backup \
  && ok "restauration d'une sauvegarde : le monitor est bien là" || fail "restauration"

docker restart "$NAME" >/dev/null
wait_health
curl -fsS "$URL/monitors" -H "X-API-Key: $KEY" | grep -q nightly-backup && ok "données conservées après redémarrage" || fail "données perdues"

docker stop -t 30 "$NAME" >/dev/null
docker run --rm --entrypoint sh -v "$VOL:/data" "$IMG" -c 'tail -5 /data/log/postgres.log' | grep -q "database system is shut down" \
  && ok "arrêt propre de PostgreSQL" || fail "PostgreSQL pas arrêté proprement"
echo "TOUT OK"
