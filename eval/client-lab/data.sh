#!/bin/sh
# Client « équipe data » : ETL, export de rapport, archivage rsync. Vrai crond, utilisateur app.
set -e
apk add --no-cache -q bash curl python3 rsync >/dev/null
adduser -D -u 1000 app
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh
mkdir -p /opt/jobs /srv/data /exports /archive && chown app /srv/data /exports /archive
printf 'id,amount\n1,10\n2,20\n3,30\n' > /srv/data/upstream.csv && chown app /srv/data/upstream.csv
cat > /opt/jobs/etl.py <<'EOF'
import os
url = os.environ['WAREHOUSE_URL']
print('loaded 3 rows into', url.split('@')[-1])
EOF
cat > /opt/jobs/export-report.sh <<'EOF'
#!/bin/sh
# Reprend les lignes du flux amont (sans l'en-tête) : un flux vide donne un rapport vide, sans erreur.
tail -n +2 /srv/data/upstream.csv > /exports/report.csv
EOF
cat > /opt/jobs/archive.sh <<'EOF'
#!/bin/sh
rsync -a /srv/data/ /archive/
EOF
chmod +x /opt/jobs/*.sh
echo 'export WAREHOUSE_URL=postgres://etl@warehouse.internal/dw' > /home/app/.profile   # défini aussi pour le shell de connexion
W="CRONGUARD_URL=$CG_URL bash -c 'source /usr/local/lib/cronguard.sh && cg_run"
cat > /etc/crontabs/app <<EOF
* * * * * WAREHOUSE_URL=postgres://etl@warehouse.internal/dw $W $KEY_ETL bash -c "\$0"' 'python3 /opt/jobs/etl.py'
* * * * * CG_EXPECT='/exports/report.csv min=5' $W $KEY_EXPORT bash -c "\$0"' '/opt/jobs/export-report.sh'
* * * * * $W $KEY_ARCHIVE bash -c "\$0"' '/opt/jobs/archive.sh'
EOF
crond -b -l 8
echo READY
