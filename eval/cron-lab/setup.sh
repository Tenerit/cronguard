#!/bin/sh
# Labo de pannes cron RÉELLES (2026-11-10) : vrai crond, vrai utilisateur avec son ~/.profile, SDK bash.
# Lancé dans un conteneur alpine jetable par eval/cron-lab.ts. Chaque job échoue pour une raison connue
# d'avance ; les pings du SDK sont capturés dans /lab/out/<clé>.json puis analysés côté hôte.
set -e
apk add --no-cache -q bash python3 py3-requests curl >/dev/null

adduser -D -s /bin/bash app
mkdir -p /srv/tools/bin /srv/archive /home/app/jobs/data /lab/out
# Outil installé hors du PATH de cron, ajouté au PATH par le .profile de l'utilisateur (comme nvm, pyenv…).
printf '#!/bin/sh\necho ok\n' > /srv/tools/bin/report-tool && chmod +x /srv/tools/bin/report-tool
cat > /home/app/.profile <<'EOF'
export PATH="/srv/tools/bin:$PATH"
export API_TOKEN=lab-token-not-a-secret
export WAREHOUSE_DSN=postgres://lab
EOF
echo 'x' > /home/app/jobs/data/input.csv                  # existe… relativement au dossier du job, pas au HOME
chown -R app /home/app && chmod 755 /srv/archive           # /srv/archive appartient à root : app ne peut pas y écrire
cp /lab/sdk.sh /home/app/cronguard.sh && chown app /home/app/cronguard.sh
cp /lab/sdk.py /home/app/cronguard.py && chown app /home/app/cronguard.py

# SDK Python (2026-11-11) : mêmes pannes, mais le job est un script Python décoré par @monitor.
for spec in 'py-env-missing:print(len(os.environ["WAREHOUSE_DSN"]))' \
            'py-relative-path:print(open("data/input.csv").read())' \
            'py-permission:open("/srv/archive/py-export.tgz", "w").write("x")'; do
  key="${spec%%:*}"; body="${spec#*:}"
  printf 'import os, sys\nsys.path.insert(0, "/home/app")\nfrom cronguard import monitor\n\n@monitor("%s")\ndef job():\n    %s\n\njob()\n' "$key" "$body" > "/home/app/jobs/$key.py"
done
chown -R app /home/app/jobs

# Les jobs : (clé, commande). Chacun passe par cg_run, comme chez un client.
cat > /home/app/jobs/env-missing.py <<'EOF'
import os
print('exporting with token', os.environ['API_TOKEN'])
EOF
cat > /home/app/jobs/app-bug.py <<'EOF'
rows = [{'amount': '12.5'}, {'amount': 'n/a'}]
print(sum(float(r['amount']) for r in rows))
EOF
cat > /home/app/jobs/relative.sh <<'EOF'
cat data/input.csv
EOF
cat > /home/app/jobs/bash-only.sh <<'EOF'
files=(a b); echo "${files[0]}"   # tableau : syntaxe bash refusée par sh
EOF

S='export CRONGUARD_URL=http://127.0.0.1:9999; . /home/app/cronguard.sh;'   # busybox crond ignore les lignes VAR=valeur
cat > /tmp/crontab <<EOF
* * * * * bash -c '$S cg_run path-login report-tool --daily'
* * * * * bash -c '$S cg_run env-missing python3 /home/app/jobs/env-missing.py'
* * * * * bash -c '$S cg_run relative-path sh /home/app/jobs/relative.sh'
* * * * * bash -c '$S cg_run permission tar czf /srv/archive/daily.tgz /home/app/jobs'
* * * * * bash -c '$S cg_run sh-not-bash sh /home/app/jobs/bash-only.sh'
* * * * * bash -c '$S cg_run absent-file cp /mnt/nas/export.csv /home/app/'
* * * * * bash -c '$S cg_run app-bug python3 /home/app/jobs/app-bug.py'
* * * * * bash -c '$S cg_run remote-down curl -sSf --max-time 3 http://127.0.0.1:9/health'
* * * * * bash -c 'export CRONGUARD_URL=http://127.0.0.1:9999; python3 /home/app/jobs/py-env-missing.py'
* * * * * bash -c 'export CRONGUARD_URL=http://127.0.0.1:9999; python3 /home/app/jobs/py-relative-path.py'
* * * * * bash -c 'export CRONGUARD_URL=http://127.0.0.1:9999; python3 /home/app/jobs/py-permission.py'
EOF
crontab -u app /tmp/crontab

# Faux serveur CronGuard : enregistre chaque ping d'échec.
node -e "
require('http').createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
  const k = q.url.split('/').pop(); try { const st = JSON.parse(b).status; if (st === 'fail' || st === 'success') require('fs').writeFileSync('/lab/out/' + k + (st === 'fail' ? '.json' : '.ok.json'), b) } catch {}
  r.end('{}') }) }).listen(9999, '127.0.0.1')" &
crond -b -l 8
# Un passage de cron suffit (minute suivante) ; marge pour les jobs lents.
for i in $(seq 1 100); do [ "$(ls /lab/out | wc -l)" -ge 11 ] && break; sleep 2; done
ls /lab/out

# Phase 2 (eval/resolution-lab.ts) : chaque panne est réparée comme le ferait un ops, puis on attend la
# réussite suivante, relevée par le SDK (résolution constatée). Deux réparations sont HORS du champ des
# sondes (serveur distant relancé, code corrigé) : aucune différence ne doit y apparaître.
[ -f /lab/phase2 ] || exit 0
chown app /srv/archive                                              # permission, py-permission
mkdir -p /mnt/nas && echo x > /mnt/nas/export.csv                    # absent-file : le montage revient
node -e "require('http').createServer((q, r) => r.end('ok')).listen(9, '127.0.0.1')" &   # remote-down
printf 'rows = [{"amount": "12.5"}]\nprint(sum(float(r["amount"]) for r in rows))\n' > /home/app/jobs/app-bug.py
chown app /home/app/jobs/app-bug.py
cat > /tmp/crontab <<EOF
* * * * * bash -c 'export PATH=/srv/tools/bin:\$PATH; $S cg_run path-login report-tool --daily'
* * * * * bash -c 'export API_TOKEN=lab-fixed; $S cg_run env-missing python3 /home/app/jobs/env-missing.py'
* * * * * bash -c 'cd /home/app/jobs && $S cg_run relative-path sh /home/app/jobs/relative.sh'
* * * * * bash -c '$S cg_run permission tar czf /srv/archive/daily.tgz /home/app/jobs'
* * * * * bash -c '$S cg_run sh-not-bash bash /home/app/jobs/bash-only.sh'
* * * * * bash -c '$S cg_run absent-file cp /mnt/nas/export.csv /home/app/'
* * * * * bash -c '$S cg_run app-bug python3 /home/app/jobs/app-bug.py'
* * * * * bash -c '$S cg_run remote-down curl -sSf --max-time 3 http://127.0.0.1:9/health'
* * * * * bash -c 'export CRONGUARD_URL=http://127.0.0.1:9999 WAREHOUSE_DSN=postgres://fixed; python3 /home/app/jobs/py-env-missing.py'
* * * * * bash -c 'cd /home/app/jobs && export CRONGUARD_URL=http://127.0.0.1:9999; python3 /home/app/jobs/py-relative-path.py'
* * * * * bash -c 'export CRONGUARD_URL=http://127.0.0.1:9999; python3 /home/app/jobs/py-permission.py'
EOF
crontab -u app /tmp/crontab
for i in $(seq 1 100); do [ "$(ls /lab/out/*.ok.json 2>/dev/null | wc -l)" -ge 11 ] && break; sleep 2; done
ls /lab/out
