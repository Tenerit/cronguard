#!/bin/sh
# Client « boutique en ligne » : PostgreSQL local, API de facturation, sitemap. Vrai crond, utilisateur app.
set -e
apk add --no-cache -q bash curl python3 postgresql16 postgresql16-client >/dev/null
adduser -D -u 1000 app
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh        # comme l'étape 3 du README
# Base de la boutique (socket local, confiance locale).
mkdir -p /run/postgresql && chown postgres /run/postgresql
su postgres -c "initdb -D /var/lib/postgresql/data -A trust >/dev/null && pg_ctl -D /var/lib/postgresql/data -l /tmp/pg.log start >/dev/null"
sleep 2
su postgres -c "createuser app && createdb -O app shop"
su app -c "psql -q -d shop -c 'create table orders(id int, total numeric); insert into orders select g, g*9.5 from generate_series(1,500) g'"
# API de facturation interne.
echo "127.0.0.1 billing.internal" >> /etc/hosts
cat > /opt/billing.py <<'EOF'
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0))); self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *a): pass
http.server.HTTPServer(('0.0.0.0', 8080), H).serve_forever()
EOF
nohup python3 /opt/billing.py >/dev/null 2>&1 &
# Les jobs.
mkdir -p /opt/jobs /opt/tools/bin /srv/www && chown app /srv/www
cat > /opt/jobs/backup-db.sh <<'EOF'
#!/bin/sh
pg_dump -h /run/postgresql shop -f /backups/shop-$(date +%H%M).sql
EOF
cat > /opt/jobs/sync-invoices.py <<'EOF'
import urllib.request, json
req = urllib.request.Request('http://billing.internal:8080/invoices', data=json.dumps({'since': 'today'}).encode(), headers={'Content-Type': 'application/json'})
print(urllib.request.urlopen(req, timeout=5).read().decode())
EOF
cat > /opt/jobs/sitemap.sh <<'EOF'
#!/bin/sh
/usr/local/bin/gen-sitemap > /srv/www/sitemap.xml
EOF
printf '#!/bin/sh\necho "<urlset><url>/</url></urlset>"\n' > /usr/local/bin/gen-sitemap
printf '#!/bin/sh\necho "<urlset><url>/</url><url>/shop</url></urlset>"\n' > /opt/tools/bin/sitemapgen
chmod +x /opt/jobs/*.sh /usr/local/bin/gen-sitemap /opt/tools/bin/sitemapgen
echo 'export PATH=/opt/tools/bin:$PATH' > /home/app/.profile          # l'outil n'est connu que du shell de connexion
# La crontab, telle que l'import du dashboard la rend (une ligne par job, cg_run).
W="CRONGUARD_URL=$CG_URL bash -c 'source /usr/local/lib/cronguard.sh && cg_run"
cat > /etc/crontabs/app <<EOF
* * * * * CG_EXPECT='/backups/shop-*.sql min=1k' $W $KEY_BACKUP bash -c "\$0"' '/opt/jobs/backup-db.sh'
* * * * * $W $KEY_INVOICES bash -c "\$0"' 'python3 /opt/jobs/sync-invoices.py'
* * * * * $W $KEY_SITEMAP bash -c "\$0"' '/opt/jobs/sitemap.sh'
EOF
crond -b -l 8
echo READY
