#!/bin/sh
# Labo terrain 3 (eval/field-lab-3.ts) : 5 situations tirées au sort (ordre 80 à 98), reproduites comme les questions les
# décrivent, Debian et son vrai cron. Crontabs enveloppées (format de l'import) générées dans /lab/gen.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends cron bash curl ca-certificates python3 python3-requests net-tools procps >/dev/null 2>&1
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh

# ── h4 : le service HTTP local appelé par curl (journal des requêtes reçues) ──
cat > /usr/local/bin/bulk-server.py <<'EOF'
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        open('/var/log/bulk-requests.log', 'a').write(self.path + '\n')
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 8082), H).serve_forever()
EOF
nohup python3 /usr/local/bin/bulk-server.py >/dev/null 2>&1 &

# ── h10 : réseau d'entreprise. L'API n'est joignable que par le proxy (10.255.255.1 : connexion directe qui expire) ;
#    le proxy est déclaré dans le profil de l'utilisateur, comme dans la question. ──
cat > /usr/local/bin/proxy.py <<'EOF'
import http.server, json
class P(http.server.BaseHTTPRequestHandler):
    def do_GET(self):   # proxy HTTP : répond pour l'hôte demandé (l'API simulée)
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'schema': 'ok'}).encode())
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 3128), P).serve_forever()
EOF
nohup python3 /usr/local/bin/proxy.py >/dev/null 2>&1 &
useradd -m -s /bin/bash user && mkdir -p /home/user/bin/bash
for f in /home/user/.bashrc /home/user/.profile; do
  printf 'export http_proxy=http://127.0.0.1:3128\nexport https_proxy=http://127.0.0.1:3128\n' >> "$f"
done
cat > /home/user/bin/bash/stat_xplore.py <<'EOF'
#!/usr/bin/python3
import json
import requests
import os
url = 'http://10.255.255.1/webapi/rest/v1/schema'
# Set your API key in the environment variable
os.environ['APIKey'] = 'myapikey'
api_key = os.environ['APIKey']
headers = {'Accept': 'application/json', 'APIKey': api_key}
try:
    response = requests.get(url, headers=headers, timeout=5)
    print(response)
except requests.RequestException as e:
    print("Request failed:", e)
EOF
chmod +x /home/user/bin/bash/stat_xplore.py && chown -R user /home/user

# ── h14 : script Python sqlite de la question (print en Python 3), base relative « test.db » ──
useradd -m -s /bin/bash me && mkdir -p /home/me/project
cat > /home/me/project/myscript.py <<'EOF'
#!/usr/bin/python3
import sqlite3
def main():
    con = sqlite3.connect("test.db")
    with con:
        cur = con.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS testtable(Id INTEGER PRIMARY KEY, Name TEXT)")
        cur.execute("INSERT INTO testtable(Name) VALUES ('BoB')")
        cur.execute("SELECT * FROM testtable")
        print(cur.fetchall())
if __name__ == "__main__":
    main()
EOF
chmod a+x /home/me/project/myscript.py && chown -R me /home/me

# ── h18 : arp (net-tools, /usr/sbin) depuis la crontab d'un utilisateur ──
useradd -m -s /bin/bash pi

# ── Crontabs (générées par le harnais) ──
for f in /lab/gen/user-*; do [ -e "$f" ] || continue; u=$(basename "$f" | sed 's/^user-//'); crontab -u "$u" "$f"; done
# h2 : ligne ajoutée à /etc/crontab SANS champ utilisateur, comme la dernière ligne de la question.
[ -e /lab/gen/etc-crontab ] && cat /lab/gen/etc-crontab >> /etc/crontab
service cron start >/dev/null
echo READY
