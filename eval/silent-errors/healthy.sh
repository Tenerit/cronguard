#!/bin/sh
# Sorties SAINES produites par de vrais outils (pas écrites à la main) : négatifs de l'essai eval/silent-errors.ts.
# Chaque commande : sortie standard + erreurs dans /out/<nom>.txt, code de sortie dans /out/<nom>.rc.
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends postgresql mariadb-server mariadb-client rsync curl wget ca-certificates git \
  logrotate zip sqlite3 python3 procps openssl cron >/dev/null 2>&1
service postgresql start >/dev/null 2>&1; service mariadb start >/dev/null 2>&1; sleep 4
su postgres -c "createdb shop && psql -q -d shop -c 'create table orders(id int); insert into orders select generate_series(1,100)'" >/dev/null 2>&1
mysql -e "create database shop; create table shop.orders(id int) engine=MyISAM; insert into shop.orders values (1),(2)" 2>/dev/null
mkdir -p /out
run() { name="$1"; shift; sh -c "$*" > "/out/$name.txt" 2>&1; echo $? > "/out/$name.rc"; }
run apt-update        'apt-get update'
run apt-simulate      'apt-get -s upgrade'
run apt-autoclean     'apt-get autoclean'
run tar-create        'tar -czvf /tmp/etc.tgz /etc'
run tar-list          'tar -tvzf /tmp/etc.tgz'
run rsync-copy        'rsync -av /etc/ /tmp/etc-copy/'
run rsync-stats       'rsync -a --delete --stats /usr/share/doc/ /tmp/doc-copy/'
run rsync-nothing     'rsync -av /etc/ /tmp/etc-copy/'
run pg-dump           'su postgres -c "pg_dump -v shop" > /tmp/shop.sql'
run pg-dumpall        'su postgres -c "pg_dumpall" > /tmp/all.sql'
run pg-vacuum         'su postgres -c "vacuumdb -v --all"'
run mysqldump         'mysqldump --verbose --all-databases > /tmp/m.sql'
run mysqlcheck        'mysqlcheck --all-databases'
run mysql-optimize    'mysqlcheck -o --all-databases'
run curl-verbose      'curl -sv https://example.com -o /dev/null'
run wget-download     'wget -O /tmp/ex.html https://example.com'
run wget-spider       'wget -q --spider https://example.com && echo reachable'
run find-old-logs     'find /var/log -name "*.log" -mtime +7 -print'
run du-var            'du -sh /var/*'
run df                'df -h'
run gzip              'cp /etc/services /tmp/s && gzip -vf /tmp/s'
run zip               'zip -r /tmp/apt.zip /etc/apt'
run logrotate         'logrotate -v -f /etc/logrotate.conf'
run git-commit        'cd /tmp && git init -q repo && cd repo && echo x > f && git add f && git -c user.email=a@b.c -c user.name=a commit -m init'
run git-log           'cd /tmp/repo && git log --stat'
run sqlite-backup     'sqlite3 /tmp/db.sqlite "create table t(x); insert into t values(1);" && sqlite3 /tmp/db.sqlite ".backup /tmp/db.bak" && echo saved'
run python-compile    'python3 -m compileall -f /usr/lib/python3/dist-packages 2>&1 | tail -40'
run openssl-enddate   'openssl x509 -in /etc/ssl/certs/ISRG_Root_X1.pem -noout -enddate'
run dpkg-list         'dpkg -l | head -60'
run ls-etc            'ls -la /etc'
run ps                'ps aux'
run free              'free -m'
run uptime            'uptime'
run env-dump          'env | sort'
run grep-count-errors 'grep -c error /var/log/dpkg.log || true'
run crontab-empty     'crontab -l -u root || true'
run find-as-nobody    'su nobody -s /bin/sh -c "find /etc -name \"*.conf\" 2>&1 | head -40"'
run mysql-version     'mysql -V'
run psql-version      'psql --version'
run curl-health       'curl -fsS https://example.com > /dev/null && echo ok'
echo DONE
