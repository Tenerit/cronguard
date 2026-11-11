#!/bin/sh
# Labo SDK (2026-11-11) : « qu'est-ce qui a changé depuis la dernière réussite ? » et « réussi mais rien produit ».
# Lancé dans un conteneur jetable par eval/sdk-lab.ts. Les jobs sont lancés directement par cg_run (le planning cron
# n'entre pas en jeu ici) ; chaque ping est capturé dans /lab/out/<clé>-<n>.json.
set -e
apk add --no-cache -q bash python3 py3-requests curl >/dev/null
mkdir -p /lab/out /opt/tools /opt/bin2 /bak /home/app /etc/app
cp /lab/sdk.sh /opt/cronguard.sh; cp /lab/sdk.py /opt/cronguard.py

node -e "
let n = {}
require('http').createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
  const k = q.url.split('/').pop(); n[k] = (n[k] || 0) + 1
  require('fs').writeFileSync('/lab/out/' + k + '-' + n[k] + '.json', b); r.end('{}') }) }).listen(9999, '127.0.0.1')" &
sleep 1
export CRONGUARD_URL=http://127.0.0.1:9999 CG_STATE_DIR=/tmp/cg-state CG_PROBE_LOGIN=0
run() { key="$1"; shift; bash -c ". /opt/cronguard.sh; cg_run $key $*" || true; }

# ── 1. Outil mis à jour (pg_dump 15.4 → 16.1, le nouveau échoue) ──
printf '#!/bin/sh\n[ "$1" = --version ] && echo "pg_dump (PostgreSQL) 15.4" && exit 0\nexit 0\n' > /opt/tools/pg_dump; chmod +x /opt/tools/pg_dump
PATH=/opt/tools:$PATH run tool-upgrade pg_dump -Fc shop
printf '#!/bin/sh\n[ "$1" = --version ] && echo "pg_dump (PostgreSQL) 16.1" && exit 0\necho "pg_dump: error: server version mismatch"; exit 1\n' > /opt/tools/pg_dump
PATH=/opt/tools:$PATH run tool-upgrade pg_dump -Fc shop

# ── 2. Script du job modifié ──
printf '#!/bin/sh\necho ok\n' > /home/app/job.sh; chmod +x /home/app/job.sh
run script-modified /home/app/job.sh
sleep 1; printf '#!/bin/sh\necho "step 2 failed"; exit 3\n' > /home/app/job.sh
run script-modified /home/app/job.sh

# ── 3. Variable retirée ──
printf '#!/bin/sh\n[ -n "$API_TOKEN" ] || { echo "API_TOKEN missing"; exit 1; }\n' > /home/app/needs-token.sh; chmod +x /home/app/needs-token.sh
API_TOKEN=x run var-removed /home/app/needs-token.sh
run var-removed /home/app/needs-token.sh

# ── 4. PATH modifié ──
printf '#!/bin/sh\necho report\n' > /opt/bin2/report-tool; chmod +x /opt/bin2/report-tool
PATH=/opt/bin2:/usr/bin:/bin run path-changed report-tool
PATH=/usr/bin:/bin run path-changed report-tool

# ── 5. Commande modifiée (argument faux) ──
printf '#!/bin/sh\n[ "$1" = --full ] || { echo "unknown option $1"; exit 2; }\n' > /home/app/export.sh; chmod +x /home/app/export.sh
run command-changed /home/app/export.sh --full
run command-changed /home/app/export.sh --fll

# ── 6. Fichier de configuration modifié ──
printf 'mode=ok\n' > /etc/app/app.conf
printf '#!/bin/sh\ngrep -q mode=ok "$2" || { echo "invalid config"; exit 4; }\n' > /home/app/app; chmod +x /home/app/app
run config-modified /home/app/app --config /etc/app/app.conf
sleep 1; printf 'mode=broken-value\n' > /etc/app/app.conf
run config-modified /home/app/app --config /etc/app/app.conf

# ── 7. Dossier de lancement modifié (chemin relatif) ──
mkdir -p /home/app/data; echo x > /home/app/data/in.csv
printf '#!/bin/sh\ncat data/in.csv\n' > /home/app/read.sh; chmod +x /home/app/read.sh
( cd /home/app && run cwd-changed /home/app/read.sh )
( cd / && run cwd-changed /home/app/read.sh )

# ── 8. SDK Python : script du job modifié ──
printf 'import sys\nsys.path.insert(0, "/opt")\nfrom cronguard import monitor\n\n@monitor("py-script-modified")\ndef job():\n    print("ok")\n\njob()\n' > /home/app/pyjob.py
python3 /home/app/pyjob.py || true
sleep 1; printf 'import sys\nsys.path.insert(0, "/opt")\nfrom cronguard import monitor\n\n@monitor("py-script-modified")\ndef job():\n    raise ValueError("bad row 42")\n\njob()\n' > /home/app/pyjob.py
python3 /home/app/pyjob.py || true

# ── 9. Aucun changement : le serveur distant tombe ──
node -e "require('http').createServer((q, r) => r.end('ok')).listen(9100, '127.0.0.1')" & SRV=$!
sleep 1; run no-change curl -sSf --max-time 2 http://127.0.0.1:9100/health
kill $SRV; sleep 1; run no-change curl -sSf --max-time 2 http://127.0.0.1:9100/health

# ── Sorties attendues (CG_EXPECT) ──
CG_EXPECT="/bak/a.dump" run expect-empty sh -c ': > /bak/a.dump'
echo old > /bak/b.dump; touch -d '2020-01-01' /bak/b.dump
CG_EXPECT="/bak/b.dump" run expect-stale true
CG_EXPECT="/bak/c.dump" run expect-absent true
CG_EXPECT="/bak/d.dump min=1k" run expect-small sh -c 'echo tiny > /bak/d.dump'
CG_EXPECT="/bak/e.dump min=1k" run expect-good sh -c 'head -c 2048 /dev/zero > /bak/e.dump'
CG_EXPECT="/bak/db-*.dump min=1k" run expect-glob sh -c 'head -c 2048 /dev/zero > /bak/db-2.dump'
printf 'import sys, os\nsys.path.insert(0, "/opt")\nfrom cronguard import monitor\n\n@monitor("py-expect-empty")\ndef job():\n    open("/bak/py.dump", "w").close()\n\njob()\n' > /home/app/pyexp.py
CG_EXPECT="/bak/py.dump" python3 /home/app/pyexp.py || true
i=0; while [ $i -lt 20 ]; do CG_EXPECT="/bak/n.dump min=1k" run expect-normal sh -c 'head -c 4096 /dev/zero > /bak/n.dump'; i=$((i+1)); done
sleep 1
ls /lab/out | wc -l
