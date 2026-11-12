#!/bin/sh
# Labo SDK, étape 5 (2026-11-12) : pings jamais perdus, chevauchement, étapes, cronguard doctor.
set -e
apk add --no-cache -q bash python3 py3-requests curl >/dev/null
mkdir -p /lab/out /opt/tools /bak
cp /lab/sdk.sh /opt/cronguard.sh; cp /lab/sdk.py /opt/cronguard.py
export CRONGUARD_URL=http://127.0.0.1:9999 CG_STATE_DIR=/tmp/cg-state CG_PROBE_LOGIN=0 CG_PROBE_NET=0
run() { bash -c '. /opt/cronguard.sh; cg_run "$@"' _ "$@" || true; }
server() {
  node -e "
  let n = 0
  require('http').createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
    n++; require('fs').writeFileSync('/lab/out/' + String(n).padStart(3, '0') + '-' + q.url.split('/').pop() + '.json', b); r.end('{}') }) }).listen(9999, '127.0.0.1')" &
  sleep 1
}

# ── 7. Serveur coupé pendant 10 échecs, puis rétabli ──
for i in 1 2 3 4 5 6 7 8 9 10; do run queue sh -c "echo run $i; exit 1"; done
server
run queue sh -c 'echo run 11; exit 0'

# ── 8. Chevauchement : signalé, puis exécution sautée ──
run overlap sleep 6 &
sleep 1
run overlap sh -c 'echo "lock held by another run"; exit 1'
CG_SKIP_IF_RUNNING=1 run overlap-skip-base true
(run overlap-skip sleep 6 &) ; sleep 1
CG_SKIP_IF_RUNNING=1 run overlap-skip sh -c 'echo should-not-run > /bak/ran.txt'
[ -f /bak/ran.txt ] && echo "SKIP-RAN" > /lab/out/skip-ran.flag || true
wait

# ── 9. Étapes (bash et Python) ──
printf '. /opt/cronguard.sh\ncg_step dump\nsleep 1\ncg_step upload\necho "upload failed: 403"\nexit 1\n' > /tmp/steps.sh
run steps bash /tmp/steps.sh
printf 'import sys, time\nsys.path.insert(0, "/opt")\nfrom cronguard import monitor, cg_step\n\n@monitor("py-steps")\ndef job():\n    cg_step("extract")\n    time.sleep(1)\n    cg_step("load")\n    raise RuntimeError("load failed")\n\njob()\n' > /tmp/pysteps.py
python3 /tmp/pysteps.py 2>/dev/null || true

# ── 10. cronguard doctor (rien n'est exécuté) ──
printf '#!/bin/sh\necho ok\n' > /opt/tools/report-tool; chmod +x /opt/tools/report-tool
doc() { key="$1"; shift; ( cd /root && PATH=/opt/tools:/usr/bin:/bin bash -c '. /opt/cronguard.sh; cg_doctor "$1"' _ "$1" > "/lab/out/doctor-$key.txt" 2>&1 ) || true; }
doc bad-path 'report-tool --daily'
doc bad-var 'python3 /app/export.py --token $API_TOKEN'
doc bad-relative 'sh scripts/run.sh'
doc bad-redirect 'pg_dump shop > /nonexistent/dir/shop.dump'
doc bad-percent 'tar czf /bak/files-$(date +%F).tgz /data'
doc ok-ls 'ls -la /tmp > /tmp/list.txt'
doc ok-abs '/opt/tools/report-tool --daily'
doc ok-env 'env LANG=C /usr/bin/env true'
( cd /root && PATH=/opt/tools:/usr/bin:/bin python3 /opt/cronguard.py doctor 'report-tool --daily' > /lab/out/doctor-py.txt 2>&1 ) || true
sleep 1
ls /lab/out | wc -l
