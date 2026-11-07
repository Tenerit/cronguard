#!/bin/sh
# Démarre PostgreSQL et Redis en local (127.0.0.1 seulement, jamais exposés), puis l'API
# et les workers. Si un processus meurt, tout s'arrête : le redémarrage est confié à Docker
# (--restart unless-stopped). Sur SIGTERM, arrêt propre de PostgreSQL.
set -eu

PGDATA=/data/postgres
mkdir -p /data/redis /data/log /run/postgresql
chown postgres:postgres /data/log
chown -R postgres:postgres /run/postgresql
[ -d "$PGDATA" ] || { mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; }

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[cronguard] Initialisation de PostgreSQL dans $PGDATA"
  # trust en local : la base n'écoute que sur 127.0.0.1 et le port n'est pas publié.
  su-exec postgres initdb -D "$PGDATA" -U cronguard --auth=trust --encoding=UTF8 >/dev/null
  echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
fi

su-exec postgres pg_ctl -D "$PGDATA" -l /data/log/postgres.log -w start >/dev/null
su-exec postgres psql -U cronguard -h 127.0.0.1 -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='cronguard'" | grep -q 1 \
  || su-exec postgres createdb -U cronguard -h 127.0.0.1 cronguard

chown -R redis:redis /data/redis
su-exec redis redis-server --bind 127.0.0.1 --port 6379 --dir /data/redis \
  --appendonly yes --daemonize yes --logfile /data/redis/redis.log

pids=""
stop() {
  echo "[cronguard] Arrêt"
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  for p in $pids; do wait "$p" 2>/dev/null || true; done
  redis-cli -h 127.0.0.1 shutdown >/dev/null 2>&1 || true
  su-exec postgres pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
}
trap 'stop; exit 0' TERM INT

# Migrations une fois, avant les processus (ils les rejouent aussi, idempotentes).
su-exec cronguard node dist/db/migrations.js

for entry in api/index workers/analysis.worker workers/timeout.checker workers/retention.worker workers/self-monitor.worker; do
  su-exec cronguard node "dist/$entry.js" &
  pids="$pids $!"
done

# Sauvegardes : pg_dump au format custom (compressé, sans tube qui masquerait une erreur),
# au démarrage puis toutes les BACKUP_INTERVAL_HOURS, rétention BACKUP_KEEP_DAYS.
# Restauration : pg_restore -h 127.0.0.1 -U cronguard -d cronguard --clean <fichier>
if [ "${BACKUP_ENABLED:-true}" != "false" ]; then
  mkdir -p /data/backups && chown postgres:postgres /data/backups
  (
    while :; do
      f="/data/backups/cronguard_$(date +%Y%m%d_%H%M%S).dump"
      if su-exec postgres pg_dump -h 127.0.0.1 -U cronguard -Fc -f "$f.tmp" cronguard; then
        mv "$f.tmp" "$f" && echo "[cronguard] Sauvegarde : $f"
      else
        rm -f "$f.tmp"; echo "[cronguard] ÉCHEC de la sauvegarde" >&2
      fi
      find /data/backups -name 'cronguard_*.dump' -mtime "+${BACKUP_KEEP_DAYS:-7}" -delete
      sleep "$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"
    done
  ) &
  pids="$pids $!"
fi
echo "[cronguard] Prêt sur http://localhost:${PORT:-3000}/dashboard"

# Surveillance : si un processus s'arrête, on arrête tout (Docker relance le conteneur).
while :; do
  for p in $pids; do
    if ! kill -0 "$p" 2>/dev/null; then
      echo "[cronguard] Un processus s'est arrêté ($p), arrêt du conteneur"
      stop; exit 1
    fi
  done
  sleep 5 & wait $!
done
