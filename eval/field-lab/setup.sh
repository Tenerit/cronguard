#!/bin/sh
# Labo terrain (eval/field-lab.ts) : les 12 situations tirées au sort, reproduites comme les questions les décrivent,
# dans une Debian avec son vrai cron. Les crontabs enveloppées (format de l'import) sont générées dans /lab/gen.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends cron bash curl ca-certificates python3 sudo git perl logrotate \
  awscli php-cli mariadb-server mariadb-client procps >/dev/null 2>&1
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh

# ── 1. mysqldump : base « database » ──
service mariadb start >/dev/null 2>&1 || mysqld_safe >/dev/null 2>&1 &
sleep 4
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS \`database\`; CREATE TABLE \`database\`.t (id int); INSERT INTO \`database\`.t VALUES (1),(2);" || true
# ── 2. tar : le dossier est dans le HOME de l'utilisateur, la crontab est celle de root ──
useradd -m user && mkdir -p /home/user/backupfolder /var/www && echo site > /var/www/index.html
# ── 4. script sans #!, syntaxe bash ──
mkdir -p /home2/backup/bootstrap /home2/backup/sv2
printf 'echo "bootstrap backup"\nexit 0\n' > /home2/backup/bootstrap/backup.sh
printf 'echo "sv2 backup"\nexit 0\n' > /home2/backup/sv2/backup.sh
cat > /home2/backup/backup-all.sh <<'EOF'
echo "bootstrap"
/home2/backup/bootstrap/backup.sh
BOOTSTRAP_STATUS=$([ "$?" == 0 ] && echo "OK" || echo "** FAIL **")
echo "sv2"
/home2/backup/sv2/backup.sh
SV2_STATUS=$([ "$?" == 0 ] && echo "OK" || echo "** FAIL **")
if [ "$BOOTSTRAP_STATUS" == "OK" ] && [ "$SV2_STATUS" == "OK" ] ; then TITULO="Backup OK"; else TITULO="Backup !FAILED!"; fi
( echo "Backup status"; echo "BOOTSTRAP_STATUS = $BOOTSTRAP_STATUS"; echo "SV2_STATUS = $SV2_STATUS" ) | mail -s "${TITULO}" "redacted@example.com"
EOF
chmod +x /home2/backup/backup-all.sh /home2/backup/*/backup.sh
printf '#!/bin/sh\ncat > /tmp/mail-$(date +%%s).txt\n' > /usr/bin/mail && chmod +x /usr/bin/mail   # facteur local : le mail est écrit, pas envoyé
# ── 6. git dans /usr/local/bin seulement, dépôt de heilee ──
mv /usr/bin/git /usr/local/bin/git
useradd -m heilee && mkdir -p /home/heilee/www && cd /home/heilee/www && /usr/local/bin/git init -q && /usr/local/bin/git remote add origin https://example.invalid/site.git && cd /
chmod -R a+rwX /home/heilee/www
# ── 7. php dans /usr/local/bin seulement ──
PHPBIN=$(readlink -f /usr/bin/php); rm -f /usr/bin/php; ln -s "$PHPBIN" /usr/local/bin/php
printf '<?php file_put_contents("/tmp/download.txt", "ok"); echo "downloaded\\n";\n' > /var/www/download.php
# ── 13. fonction shell dans /etc/crontab ──
mkdir -p /opt/bin/zsh /var/log/case13 && printf '#!/bin/sh\necho "test line"\n' > /opt/bin/zsh/test.zsh && chmod +x /opt/bin/zsh/test.zsh
# ── 14. script perl qui sort en erreur ──
printf '#!/usr/bin/perl\nuse strict;\nprint "test\\n";\nexit 1;\n' > /root/test.sh && chmod +x /root/test.sh
# ── 16. identifiants aws rangés dans /home/ubuntu par « sudo aws configure » ──
useradd -m ubuntu && mkdir -p /home/ubuntu/.aws /home/ubuntu/data
printf '[default]\naws_access_key_id = AKIAEXAMPLEEXAMPLE00\naws_secret_access_key = example/example/example/example/exampl\n' > /home/ubuntu/.aws/credentials
printf '#!/bin/sh\naws s3 cp s3://datasets/B3 /home/ubuntu/data/B3 --recursive\n' > /home/ubuntu/s3syncer.sh && chmod +x /home/ubuntu/s3syncer.sh
# ── 18. variable du conteneur lue par un script lancé par cron (docker run -e INFLUXDB_USER) ──
ln -s "$(command -v python3)" /usr/bin/python3.7          # l'image de la question avait python3.7
mkdir -p /usr/src/collector && cat > /usr/src/collector/run.py <<'EOF'
import os, sys
with open("/var/log/lastlog", "a") as f:
    try:
        user = os.environ['INFLUXDB_USER'] or "None"
        f.write("I am running python as {} with {}\n".format(user, sys.version_info[:3]))
    except Exception as e:
        f.write("I failed: {}\n".format(str(e)))
EOF
# ── 20. rake via rbenv, dans le PATH du shell de connexion seulement ──
useradd -m -s /bin/bash app_user && mkdir -p /home/app_user/.rbenv/shims /var/www/apps/my_app/current
printf '#!/bin/sh\necho "pulled 12 records into things"\n' > /home/app_user/.rbenv/shims/rake && chmod +x /home/app_user/.rbenv/shims/rake
echo 'export PATH="$HOME/.rbenv/shims:$PATH"' > /home/app_user/.bash_profile
chown -R app_user /home/app_user /var/www/apps
# ── 21. logrotate -f sur des journaux de 1 Ko (limite : 100 Mo) ──
mkdir -p /var/www/html/project/storage/logs
for d in 01 02 03; do echo "log $d" > /var/www/html/project/storage/logs/laravel-2026-11-$d.log; done
printf '/var/www/html/project/storage/logs/laravel-*.log {\n    su root adm\n    rotate 0\n    size 100M\n}\n' > /etc/logrotate.d/laravel.conf

# ── Crontabs (générées par le harnais au format de l'import) ──
cp /lab/gen/cron.d-case0 /etc/cron.d/case0 && chmod 644 /etc/cron.d/case0
ln /etc/cron.d/case0 /root/case0.hardlink                       # 0 : un 2e lien physique, comme l'overlay de Docker
cp /lab/gen/cron.d-test-cron /etc/cron.d/test-cron && chmod 644 /etc/cron.d/test-cron
cp /lab/gen/cron.d-case18 /etc/cron.d/case18 && chmod 644 /etc/cron.d/case18
cp /lab/gen/cron.d-case13 /etc/cron.d/case13 && chmod 644 /etc/cron.d/case13   # fichier à part : s'il est rejeté, il n'emporte pas les autres
cat /lab/gen/etc-crontab >> /etc/crontab
crontab -u root /lab/gen/root-crontab
service cron start >/dev/null
echo READY
