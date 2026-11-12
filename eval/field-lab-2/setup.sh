#!/bin/sh
# Labo terrain 2 (eval/field-lab-2.ts) : 12 situations tirées au sort, reproduites comme les questions les décrivent,
# Debian et son vrai cron. Crontabs enveloppées (format de l'import) générées dans /lab/gen.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends cron bash curl ca-certificates python3 perl openssh-server openssh-client \
  rsync postgresql postgresql-client wget chkrootkit logwatch procps >/dev/null 2>&1
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh
printf '#!/bin/sh\ncat > /tmp/mail-$(date +%%s%%N).txt\n' > /usr/bin/mail && chmod +x /usr/bin/mail   # facteur local

# ── g1 : script perl de dézippage (texte de la question), zip dans /root/perl ──
mkdir -p /root/perl
python3 -c "import zipfile; z=zipfile.ZipFile('/root/perl/data.zip','w'); z.writestr('report.csv','a,b\n1,2\n'); z.close()"
cat > /root/perl/unzip.pl <<'EOF'
#!/usr/bin/perl
use IO::Uncompress::Unzip qw(unzip $UnzipError);
$dir = '/root/perl';
open (han2, "ls -l $dir/*.zip |awk '{print \$9}'|");
@array1 = <han2>;
chomp(@array1);
for ($i=0;$i<=$#array1;$i++) {
$zipfile = $array1[$i];
$u = new IO::Uncompress::Unzip $zipfile
    or die "Cannot open $zipfile: $UnzipError";
die "Zipfile has no members"
    if ! defined $u->getHeaderInfo;
for ( $status = 1; $status > 0; $status = $u->nextStream) {
     $name = $u->getHeaderInfo->{Name};
    warn "Processing member $name\n" ;
    if ($name =~ /\/$/) {
        mkdir $name;
    }
    else {
        unzip $zipfile => $name, Name => $name
            or die "unzip failed: $UnzipError\n";
    }
}
}
EOF
chmod +x /root/perl/unzip.pl

# ── g7 : Django dans un conteneur, réglages lus dans l'environnement du conteneur (docker run -e DATABASE_URL) ──
mkdir -p /app/myapp
cat > /app/manage.py <<'EOF'
#!/usr/bin/env python3
# Équivalent minimal de manage.py : les réglages lisent l'environnement du conteneur, comme dans la question.
import os, sys
DATABASES = {'default': os.environ['DATABASE_URL']}
if sys.argv[1:3] == ['crontab', 'run']:
    from datetime import datetime
    print(datetime.today().date()); print('RUNNING CRONTAB YESSSSSSSSSSS!!!!!!!')
EOF
touch /var/log/cron.log

# ── g10 : rsync par ssh avec une clé protégée par phrase de passe (agent de la session absent sous cron) ──
useradd -m -s /bin/bash myuser && mkdir -p /home/backup && chown myuser /home/backup
echo "127.0.0.1 mybox" >> /etc/hosts
mkdir -p /run/sshd && ssh-keygen -A >/dev/null && /usr/sbin/sshd
su myuser -c "ssh-keygen -q -t ed25519 -N 'my passphrase' -f ~/.ssh/id_ed25519 && cp ~/.ssh/id_ed25519.pub ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
su myuser -c "ssh-keyscan -t ed25519 mybox > ~/.ssh/known_hosts 2>/dev/null"
mkdir -p /home/backup-src && echo data > /home/backup-src/a.txt

# ── g12 : script de sauvegarde qui échoue, ligne « || mail » ──
useradd -m test && cat > /home/test/take_backup.sh <<'EOF'
#!/bin/bash
echo "starting backup"
cp /srv/missing-db.dump /home/test/backup/ || { echo "backup failed: source missing"; exit 3; }
EOF
chown -R test /home/test

# ── g19 : script dans /etc/cron.hourly avec un point dans le nom (run-parts l'ignore) ──
useradd -m naruto
cp /lab/gen/Hour-sound.sh /etc/cron.hourly/Hour-sound.sh && chmod +x /etc/cron.hourly/Hour-sound.sh

# ── g20 : script du cours (texte de la question), entrée relative et « ~ » entre guillemets ──
useradd -m -s /bin/bash kali && mkdir -p /home/kali/Documents/GitHub/BFOR206
printf '127.0.0.1\n127.0.0.2\n' > /home/kali/Documents/GitHub/BFOR206/hw1_input.txt
cat > /home/kali/Documents/GitHub/BFOR206/hw1.sh <<'EOF'
#!/bin/bash
hw1_input="~/Documents/GitHub/BFOR206/hw1_input.txt"
while read -r address; do
        ping -c 1 $address > /dev/null
if [ $? -eq 0 ]; then
    echo "Ping successful for $address at $(date)" >> hw1_output.log
else
    echo "Ping failed for $address at $(date)" >> hw1_output.log
    echo "Ping failed for $address at $(date)" | mail -s "Ping Error!" kali@kali
  fi
done < "hw1_input.txt"
EOF
chown -R kali /home/kali

# ── g29 : site CodeIgniter (serveur local), URL de la question écrite avec un espace ──
echo "127.0.0.1 www.urlgoeshere.co.uk" >> /etc/hosts
cat > /opt/site.py <<'EOF'
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'<html>CodeIgniter</html>')
    def log_message(self, *a): pass
http.server.HTTPServer(('0.0.0.0', 80), H).serve_forever()
EOF
nohup python3 /opt/site.py >/dev/null 2>&1 &

# ── g30 : pg_dump par TCP ; le mot de passe est dans le ~/.pgpass de l'utilisateur interactif, pas de root ──
PGV=$(ls /usr/lib/postgresql/) && mkdir -p /usr/lib/postgresql/12/bin && ln -sf /usr/lib/postgresql/$PGV/bin/pg_dump /usr/lib/postgresql/12/bin/pg_dump
service postgresql start >/dev/null 2>&1; sleep 3
su postgres -c "psql -q -c \"create user kp with password 'kp-secret'\" && createdb -O kp db_kp"
useradd -m dba && echo "127.0.0.1:5432:db_kp:kp:kp-secret" > /home/dba/.pgpass && chmod 600 /home/dba/.pgpass && chown dba /home/dba/.pgpass
echo "export PGUSER=kp" >> /home/dba/.profile
mkdir -p /backup-nfs && chmod 777 /backup-nfs

# ── g40 : rsync avec substitution de processus <( ) (syntaxe bash) ──
useradd -m qa && mkdir -p /home/qa/buildbot/master/packages/rhel7 && touch -d '60 days ago' /home/qa/buildbot/master/packages/rhel7/pkg-1.rpm

# ── g42 : script de sauvegarde CVS (texte de la question), chemins relatifs ──
mkdir -p /home/cvs/data /home/cvs/backup && echo "module" > /home/cvs/data/CVSROOT
cat > /home/cvs/backup/cvs_backupScript.sh <<'EOF'
#!/bin/bash

CVS_ROOT="/home/cvs/data"

echo "=======================================" >> cvs_backup.log
echo "            CVS BACKUP START           " >> cvs_backup.log
echo "=======================================" >> cvs_backup.log
date >> cvs_backup.log
tar -czf cvs_backup.tar.gz $CVS_ROOT
echo "=======================================" >> cvs_backup.log
echo $(date '+%Y-%m-%d %H:%M') "End Backup" >> cvs_backup.log
echo "=======================================" >> cvs_backup.log
EOF
chmod +x /home/cvs/backup/cvs_backupScript.sh

# ── g44 : script de contrôle qui appelle chkrootkit et logwatch (dans /usr/sbin) ──
useradd -m user && mkdir -p /home/user/bin
cat > /home/user/bin/checkSystem <<'EOF'
#!/bin/bash
tar -czf /tmp/etc-check.tgz /etc 2>&1 | mail -s "tar" root
chkrootkit -q | mail -s "chkrootkit" root
logwatch --output stdout --range today | mail -s "logwatch" root
EOF
chmod 750 /home/user/bin/checkSystem

# ── g46 : find -exec tar fichier par fichier (ligne de la question, déjà corrigée en partie) ──
useradd -m swayraines && mkdir -p /home/swayraines/docs /home/swayraines/folder/backup /folder/backup
for f in a b c; do echo "$f" > /home/swayraines/docs/$f.txt; done
chown -R swayraines /home/swayraines /folder

# ── Crontabs (générées par le harnais) ──
for f in /lab/gen/cron.d-*; do [ -e "$f" ] || continue; n=$(basename "$f" | sed 's/^cron.d-//'); cp "$f" "/etc/cron.d/$n"; chmod 644 "/etc/cron.d/$n"; done
for f in /lab/gen/user-*; do [ -e "$f" ] || continue; u=$(basename "$f" | sed 's/^user-//'); crontab -u "$u" "$f"; done
sed -i 's#^17 \*\t\* \* \*\troot\tcd / \&\& run-parts --report /etc/cron.hourly#* * * * * root cd / \&\& run-parts --report /etc/cron.hourly#' /etc/crontab   # cron.hourly chaque minute (planning seul)
grep -q 'cron.hourly' /etc/crontab && grep 'cron.hourly' /etc/crontab
service cron start >/dev/null
echo READY
