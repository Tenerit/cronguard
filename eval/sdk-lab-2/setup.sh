#!/bin/sh
# Labo SDK, étape 3 (2026-11-11) : mémoire et disque, réseau, secrets masqués sur la machine du job.
# Conteneur jetable lancé par eval/sdk-lab-2.ts avec --memory=200m et un tmpfs de 1 Mo sur /full.
set -e
apk add --no-cache -q bash python3 py3-requests curl coreutils >/dev/null
mkdir -p /lab/out
cp /lab/sdk.sh /opt/cronguard.sh

node -e "
let n = {}
require('http').createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
  const k = q.url.split('/').pop(); n[k] = (n[k] || 0) + 1
  require('fs').writeFileSync('/lab/out/' + k + '-' + n[k] + '.json', b); r.end('{}') }) }).listen(9999, '127.0.0.1')" &
node -e "require('http').createServer((q, r) => r.end('ok')).listen(9100, '127.0.0.1')" &
sleep 1
export CRONGUARD_URL=http://127.0.0.1:9999 CG_STATE_DIR=/tmp/cg-state CG_PROBE_LOGIN=0
run() { bash -c '. /opt/cronguard.sh; cg_run "$@"' _ "$@" || true; }

# ── C. Mémoire et disque ──
run oom python3 -c 'x = bytearray(600 * 1024 * 1024); print(len(x))'
run disk-full dd if=/dev/zero of=/full/big bs=1k count=4096
run sigterm sh -c 'kill -TERM $$'
run timeout timeout 1 sleep 5

# ── D. Réseau ──
run net-dns curl -sS http://nonexistent-host.invalid:8080/health
run net-refused curl -sS http://127.0.0.1:81/health
run net-timeout curl -sS --max-time 3 http://192.0.2.1:81/health
run net-open sh -c 'echo "Error: connect ECONNREFUSED 127.0.0.1:9100"; exit 1'

# ── E. Secrets masqués à la source (la sortie capturée ici est celle qu'envoie le SDK, avant le serveur) ──
run mask-secrets sh -c 'echo "git clone https://ghp_$(printf A%.0s $(seq 36))@github.com/acme/app.git"; echo "DB_PASS=Wq8.Lm3-Zk1"; echo "mongodb+srv://app:Zx9-Qw8!pL@cluster0.mongodb.net/prod"; echo "docker login -u ci -p Hk2_mN7qR4 registry.acme.io"; echo "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"; exit 1'
run mask-clean sh -c 'echo "pg_dump (PostgreSQL) 16.1 /usr/lib/postgresql/16/bin/pg_dump commit 4f427c8fc6082dcd21221c2b8aaba237d01997f4 mkdir -p \$BACKUP_DIR ssh -p 2222 host"; exit 1'
sleep 1
ls /lab/out | wc -l
