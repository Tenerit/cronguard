# Nommage des jobs, essai 2 (2026-11-11)

- **lignes** : 77
- **noms_acceptes** : 100 % (attente ≥ 90 %)
- **roles_acceptes** : 84 %
- **critique_accord** : 96 % sur 26 cas clairs (attente ≥ 80 %)
- **latence_mediane_s** : 5.6 (attente ≤ 5)

## Toutes les lignes (relecture humaine)

1. `0 5 * * 1-5 /home/cvs/backup/cvs_backupScript.sh`
   - code : **cvs_backupScript**
   - CronGuard : **cvs-backup-script** — Effectue une sauvegarde du système CVS — du lundi au vendredi, à 05:00 — ⚑ critique · marqué critique
2. `15 16 * * 1-5 /home/cvs/backup/cvs_backupScript.sh 2>/home/cvs/backup/errorBackup.log >/home/cvs/backup/output.log`
   - code : **cvs_backupScript**
   - CronGuard : **cvs-backup-script** — Exécute un script de sauvegarde pour CVS — du lundi au vendredi, à 16:15 — ⚑ critique · marqué critique
3. `15 0 * * * /share/CACHEDEV1_DATA/.scripts/backup.sh`
   - code : **backup**
   - CronGuard : **system-backup** — Effectue une sauvegarde du système. — tous les jours, à 00:15 — ⚑ critique · marqué critique
4. `0 2 * * * path/to/my/script/local_databasesBackup.sh ; path/to/my/script/remote_databasesBackup.sh`
   - code : **local_databasesBackup**
   - CronGuard : **local-remote-databases-backup** — Effectue des sauvegardes locales et distantes des bases de données — tous les jours, à 02:00 — ⚑ critique · marqué critique
5. `0 4 * * * mysqldump -u root -p PASS database > backup_`date "+\%F"`.sql 2> cron_back.log`
   - code : **mysqldump**
   - CronGuard : **mysql-backup** — Effectue une sauvegarde de la base de données — tous les jours, à 04:00 — ⚑ critique · marqué critique
6. `*/30 * * * * mysqldump -u root -pVERYSECUREPASSWORD --all-databases > /var/www/cloud/dump_komplett.sql &> /dev/null`
   - code : **mysqldump**
   - CronGuard : **mysql-backup** — Effectue une sauvegarde complète de la base de données MySQL — toutes les 30 minutes — ⚑ critique · marqué critique
7. `* * * * * ~/.scripts/db_back_up.sh`
   - code : **db_back_up**
   - CronGuard : **db-back-up** — Effectue une sauvegarde de la base de données — toutes les minutes — ⚑ critique · marqué critique
8. `00 10 * * * root     mysqldump -u root -ppasswordD billing "/home/backup/database_`date '+%m-%d-%Y'`.sql"`
   - code : **mysqldump**
   - CronGuard : **mysql-backup** — Effectue une sauvegarde de la base de données billing. — tous les jours, à 10:00 — ⚑ critique · marqué critique
9. `* * * * * /usr/lib/postgresql/12/bin/pg_dump -h 127.0.0.1 -Fc db_kp -f /backup-nfs/dump_dbkp_TEST1`date +\%d-\%m-\%y`.sql`
   - code : **pg_dump**
   - CronGuard : **postgresql-database-backup** — Effectue une sauvegarde de la base de données PostgreSQL. — toutes les minutes — ⚑ critique · marqué critique
10. `0 1 * * * rsync -avzhe "ssh -p 22" root@192.168.201.8:/backups/mysql/ /home/DB >> /var/log/cron.log`
   - code : **rsync**
   - CronGuard : **sync-mysql-backups** — Synchronise les sauvegardes MySQL d'un serveur distant vers un répertoire local. — tous les jours, à 01:00 — ⚑ critique · marqué critique
11. `* * * * * rsync -av --delete myuser@mybox:/home/backup/ /home/backup`
   - code : **rsync**
   - CronGuard : **sync-backup** — Synchronise la sauvegarde sur un autre emplacement — toutes les minutes — ⚑ critique · marqué critique
12. `* * * * * env >> /tmp/my_env_variables`
   - code : **my_env_variables**
   - CronGuard : **export-environment-variables** — Enregistre les variables d'environnement dans un fichier temporaire. — toutes les minutes · marqué non critique
13. `@daily rsync -rav --remove-source-files --files-from=<(find /home/qa/buildbot/master/packages/rhel7 -type f -mtime +30 -exec basename {} \;) /home/`
   - code : **rsync**
   - CronGuard : **sync-old-packages** — Synchronise les packages vieux de plus de 30 jours sur un autre serveur — tous les jours à 00:00
14. `*/2 * * * * /usr/bin/python /home/souza/Documets/Listener/listener.py`
   - code : **python**
   - CronGuard : **run-listener-script** — Exécute un script Python de surveillance — toutes les 2 minutes
15. `* * * * * /home/me/project/myscript.py`
   - code : **myscript**
   - CronGuard : **run-python-script** — Exécute un script Python — toutes les minutes
16. `*/5 * * * * /path/to/keepalivescript.sh`
   - code : **keepalivescript**
   - CronGuard : **keepalive-script** — Exécute un script de maintien en vie — toutes les 5 minutes
17. `@reboot /home/pi/distance2.py &`
   - code : **distance2**
   - CronGuard : **pi-distance** — Exécute un script pour mesurer la distance — au démarrage de la machine
18. `00,15,30,45 * * * * php /var/www/download.php`
   - code : **download**
   - CronGuard : **download-content** — Télécharge du contenu depuis une source externe. — toutes les heures aux minutes 00, 15, 30 et 45
19. `* * * * * c:\xampp\php\php.exe -q c:\xampp\htdocs\abc\sleep.php`
   - code : **c--xampp-php-php**
   - CronGuard : **php-script-execution** — Exécute un script PHP dans le répertoire abc. — toutes les minutes
20. `* * * * * /usr/bin/php /home/cron/checkStatus.php >/dev/null 2>&1`
   - code : **php**
   - CronGuard : **check-status** — Vérifie l'état des services — toutes les minutes
21. `0 3 * * * wget -q -O - "http://mysite.it/script.php"`
   - code : **wget**
   - CronGuard : **fetch-remote-script** — Charge un script distant. — tous les jours, à 03:00
22. `* * * * * echo test > test.txt`
   - code : **echo**
   - CronGuard : **create-test-file** — Crée un fichier texte avec le mot 'test' — toutes les minutes · marqué non critique
23. `* * * * * cd /path/to/script && node script.js`
   - code : **script**
   - CronGuard : **run-script** — (rôle rejeté) — toutes les minutes
24. `* * * * * cd /path/to/project && npm start`
   - code : **npm**
   - CronGuard : **start-project** — Lance l'application du projet — toutes les minutes
25. `* * * * * cd /path/to/script && node script.js > test.txt`
   - code : **script**
   - CronGuard : **run-node-script** — (rôle rejeté) — toutes les minutes
26. `00 09 * * 1-5 root /usr/bin/curl -k "http://localhost/notifications/cronRuleAction?&auth_id=some-uuid&password=somehash&action=action&type=type&sequence=U`
   - code : **curl**
   - CronGuard : **fetch-notifications-cron** — Fetches notifications for the cron rule action — du lundi au vendredi, à 09:00
27. `* * * * * /usr/bin/curl --silent "http://localhost:8082/email-bulk?customer=Martin+Thoma&handler_pid=foo+f0a474c5-3cb1-4872-8689-c65cedb15bff&format_s`
   - code : **curl**
   - CronGuard : **send-bulk-emails** — Envoie des emails en masse à Martin Thoma. — toutes les minutes
28. `0 * * * * wget -O "/Users/me/Downloads/example.txt" "http://www.example.com/example.txt"`
   - code : **wget**
   - CronGuard : **download-example-file** — Télécharge un fichier example.txt depuis www.example.com — toutes les heures à la minute 0
29. `* * * * * wget -q --spider http://mytargeturl.com/my/url/`
   - code : **wget**
   - CronGuard : **check-website-liveness** — Vérifie la disponibilité du site web. — toutes les minutes
30. `0 3 * * * /usr/bin/wget -O - https://portal.mywebsite.com/index.php/cron/daily_cron >/dev/null 2>&1`
   - code : **wget**
   - CronGuard : **fetch-website-data** — (rôle rejeté) — tous les jours, à 03:00
31. `0 5 1 * * /usr/bin/wget -O - https://portal.mywebsite.com/index.php/cron/monthly_cron >/dev/null 2>&1`
   - code : **wget**
   - CronGuard : **fetch-remote-cron** — (rôle rejeté) — le 1er du mois, à 05:00
32. `* 01 * * 1 /home/myname/certbot-auto --quiet`
   - code : **certbot-auto**
   - CronGuard : **renew-ssl-certs** — Renouvelle les certificats SSL — le lundi, toutes les minutes de 01:00 à 01:59
33. `*/2 * * * * /home/ben/services/ssl_renew.sh >> /var/log/cron.log 2>&1`
   - code : **ssl_renew**
   - CronGuard : **renew-ssl-certs** — Renouvelle les certificats SSL des services. — toutes les 2 minutes
34. `0 */12 * * * root test -x /usr/bin/certbot -a \! -d /run/systemd/system && perl -e 'sleep int(rand(43200))' && certbot -q renew`
   - code : **test**
   - CronGuard : **renew-ssl-certs** — Renouvelle les certificats SSL sans perturbation — toutes les 12 heures, à la minute 00
35. `*/1 * * * * root logrotate -f /etc/logrotate.d/laravel.conf`
   - code : **logrotate**
   - CronGuard : **laravel-log-rotation** — Tourne les logs Laravel — toutes les minutes
36. `0,15,30,45 * * * * /data/tier2/scripts/recover_standby.sh SID >> /data/tier2/scripts/logs/recover_standby_SID_`date +\%d\%m\%y`.log 2>&1`
   - code : **recover_standby**
   - CronGuard : **recover-standby** — Recovering standby from primary database — toutes les heures aux minutes 00, 15, 30 et 45 — ⚑ critique · marqué critique
37. `50 8 * * * /usr/sbin/logrotate -f /etc/logrotate.d/mariadb`
   - code : **logrotate**
   - CronGuard : **log-mysql-logs** — Forces le rotation des logs MariaDB — tous les jours, à 08:50
38. `0 7 * * * root run-parts /etc/cron.daily`
   - code : **run-parts**
   - CronGuard : **run-parts** — (rôle rejeté) — tous les jours, à 07:00
39. `0 24 * * * docker exec -it --user root lemp_mariadb mysqldump -uroot -pxxxxxxx iot  >/home/backup/backup_data.gz`
   - code : **docker**
   - CronGuard : **mysql-backup** — Effectue une sauvegarde de la base de données iot — tous les jours, à 24:00 — ⚑ critique · marqué critique
40. `* * * * * /usr/local/bin/python /code/script.py`
   - code : **python**
   - CronGuard : **run-python-script** — Exécute un script Python dans le code — toutes les minutes
41. `15 4 * * * /var/www/mysite-nginx/nginx-reload.sh`
   - code : **nginx-reload**
   - CronGuard : **nginx-reload** — Redémarre le serveur Nginx pour appliquer les nouvelles configurations — tous les jours, à 04:15
42. `* * * * * echo "Hello world" >> /var/log/cron.log 2>&1`
   - code : **echo**
   - CronGuard : **log-hello-world** — Enregistre un message dans le journal de la tâche cron. — toutes les minutes · marqué non critique
43. `* * * * * cd /home/administrator/www/my_application && RAILS_ENV=production /usr/bin/env rake import:import_twitter >> cron.log 2>> error.log`
   - code : **rake**
   - CronGuard : **import-twitter-data** — Importe les données Twitter dans l'application — toutes les minutes
44. `*/15 * * * * app_user cd /var/www/apps/my_app/current/ && rake thing:do_stuff RAILS_ENV=production`
   - code : **rake**
   - CronGuard : **rake-task-do-stuff** — Exécute une tâche Ruby sur l'application en production — toutes les 15 minutes
45. `0 0,12 * * * /bin/bash -l -c 'cd /home/deployer/public/fulfillment_api/releases/20131010141756 && RACK_ENV=production bundle exec rake background_jobs:pr`
   - code : **bash**
   - CronGuard : **process-background-jobs** — Traite les tâches en arrière-plan et envoie des emails pour une API de fulfillment — tous les jours, à 00:00 et 12:00
46. `* * * * * echo "crontab can log to reports" >> /var/log/mazer-reports.log`
   - code : **echo**
   - CronGuard : **log-cron-activity** — Enregistre l'activité du crontab dans un rapport — toutes les minutes · marqué non critique
47. `1/2 * * * * /path/to/php /path/to/artisan my:command`
   - code : **php**
   - CronGuard : **run-my-command** — Exécute une commande artisan PHP — selon « 1/2 * * * * »
48. `* * * * * php ~/htdocs/artisan schedule:run >> /dev/null 2>&1`
   - code : **artisan**
   - CronGuard : **artisan-task-run** — Exécute une tâche planifiée définie dans le fichier artisan. — toutes les minutes
49. `*/10 * * * * /home/project/.virtualenvs/app/bin/python /home/project/workspace/app-backend/django-app/manage.py ping_google /sitemap.xml`
   - code : **python**
   - CronGuard : **ping-google-sitemap** — (rôle rejeté) — toutes les 10 minutes
50. `0,20,40 * * * * /home/mote/Desktop/CODE/ORION/djangorion/venv/bin/python /home/mote/Desktop/CODE/ORION/djangorion/manage.py crontab run d99f11ab3bcd8ffb80a4`
   - code : **python**
   - CronGuard : **django-cron-orion** — Exécute les tâches planifiées pour le projet Orion. — toutes les heures aux minutes 00, 20 et 40
51. `* * * * * ./run.sh`
   - code : **run**
   - CronGuard : **run-script** — Exécute un script local — toutes les minutes
52. `* * * * * root     python /srv/www/cpm/manage.py send_mail >> /srv/www/cpm/cron_mail.log`
   - code : **manage**
   - CronGuard : **send-mail** — Envoie des emails — toutes les minutes
53. `09,39 * * * * root   [ -x /usr/lib/php5/maxlifetime ] && [ -d /var/lib/php5 ] && find /var/lib/php5/ -depth -mindepth 1 -maxdepth 1 -type f -ignore_readdi`
   - code : ****
   - CronGuard : **php-session-purge** — Supprime les sessions PHP périmées — toutes les heures aux minutes 09 et 39 · marqué non critique
54. `57 * * * * bash /root/up427.sh; echo $?; echo$*; echo $$ > /root/up427dirfromcron.txt`
   - code : **up427**
   - CronGuard : **run-upgrade-script** — Exécute un script de mise à niveau — toutes les heures à la minute 57
55. `0 */5 * * * find /home/swayraines -mmin -300 -exec tar -zcvf folder/backup/back.tar {} > /folder/backup/backlog.log 2>&1 \;`
   - code : **find**
   - CronGuard : **archive-recent-changes** — Archivage des récents changements dans le home de swayraines — toutes les 5 heures, à la minute 00 · marqué critique
56. `0 17 * * * sudo tar -cpzf backupfolder/localhost.tar.gz /var/www`
   - code : **tar**
   - CronGuard : **create-localhost-backup** — Crée une sauvegarde du dossier www local — tous les jours, à 17:00 — ⚑ critique · marqué critique
57. `0 3,12 * * * sh /local_share/backup/backup2.0.sh &>> /local_share/backup/backup.sh.log`
   - code : **backup2.0**
   - CronGuard : **run-backup-script** — Exécute le script de sauvegarde — tous les jours, à 03:00 et 12:00 — ⚑ critique · marqué critique
58. `01 5 * * * /home/BACKUP/backup_script.sh`
   - code : **backup_script**
   - CronGuard : **backup-script** — Exécute le script de sauvegarde — tous les jours, à 05:01 — ⚑ critique · marqué critique
59. `*/5 * * * * /home/ubuntu/s3syncer.sh`
   - code : **s3syncer**
   - CronGuard : **s3-sync** — Synchronise le contenu avec S3 — toutes les 5 minutes — ⚑ critique · marqué critique
60. `* * * * * /etc/tfe-config/update-config.sh`
   - code : **update-config**
   - CronGuard : **update-config** — (rôle rejeté) — toutes les minutes
61. `*/1 * * * * python /scripts/s3_operations.py`
   - code : **s3_operations**
   - CronGuard : **run-s3-operations** — Exécute des opérations sur S3 — toutes les minutes
62. `*/3 * * * * S3_BACKUPS_BUCKET=rake-backups /root/dump_psql.sh > /root/logs/cron-2018-01-28T02:24.log`
   - code : **dump_psql**
   - CronGuard : **psql-backup** — Effectue une sauvegarde des bases de données PostgreSQL — toutes les 3 minutes — ⚑ critique · marqué critique
63. `5 15 * * 1-5 /Users/me/opt/anaconda3/bin/python /Users/me/Documents/my_text/sms_text.py`
   - code : **python**
   - CronGuard : **send-sms-texts** — Envoie des messages texte — du lundi au vendredi, à 15:05
64. `45 8,12,16 4-31 * 1-5 my_program`
   - code : **my_program**
   - CronGuard : **my-program** — Exécute le programme my_program — selon « 45 8,12,16 4-31 * 1-5 »
65. `*/30 8-17 * * 1-5 /usr/local/bin/bash /Users/aschneider/NewRelic-OpenSource/updateOpenSources.sh`
   - code : **bash**
   - CronGuard : **update-open-sources** — (rôle rejeté) — selon « */30 8-17 * * 1-5 »
66. `12 9 15,30 * * /home/run_ps.sh`
   - code : **run_ps**
   - CronGuard : **run-ps** — Exécute un script PHP — les 15 et 30 du mois, à 09:12
67. `* 0 1 * * backup_monthly.sh`
   - code : **backup_monthly**
   - CronGuard : **backup** — (rôle rejeté) — le 1er du mois, toutes les minutes de 00:00 à 00:59 — ⚑ critique · marqué critique
68. `* 0 2-31 * 0 backup_weekly.sh`
   - code : **backup_weekly**
   - CronGuard : **backup** — (rôle rejeté) — selon « * 0 2-31 * 0 » — ⚑ critique · marqué critique
69. `0 0 1 * * root   cd / && run-parts --report /etc/cron.monthly`
   - code : **run-parts**
   - CronGuard : **run-scripts** — (rôle rejeté) — le 1er du mois, à 00:00
70. `*/15 07-19 * * * /path/script`
   - code : **script**
   - CronGuard : **run-script** — Exécute un script personnalisé — selon « */15 07-19 * * * »
71. `14,29,44,59 10-21 * * * wget -q http://site/message2.php`
   - code : **wget**
   - CronGuard : **fetch-message** — Charge une page PHP d'un site — de 10 h à 21 h, aux minutes 14, 29, 44 et 59
72. `13,28,43,58 10-21 * * * wget -q http://site/message3.php`
   - code : **wget**
   - CronGuard : **fetch-message** — Charge une page PHP d'un site — de 10 h à 21 h, aux minutes 13, 28, 43 et 58
73. `* * * * * su -s /bin/sh cron -c 'cd /srv/www/htdocs/my_project && /usr/local/bin/git pull origin master'`
   - code : **su**
   - CronGuard : **pull-latest-code** — Pull the latest code from the remote repository — toutes les minutes
74. `*/1 * * * * su -s /bin/sh nobody -c 'cd ~heilee/www && git pull -q origin master' >> ~/git.log`
   - code : **su**
   - CronGuard : **pull-website-code** — Pull the website code from the remote repository — toutes les minutes
75. `* * * * * cd /var/www/example.com/wp-content/themes/mytheme && /usr/local/bin/git pull origin dev`
   - code : **git**
   - CronGuard : **update-theme** — (rôle rejeté) — toutes les minutes
76. `* * * * * /app/Scripts/Test.sh`
   - code : **Test**
   - CronGuard : **run-test-script** — Exécute un script de test — toutes les minutes
77. `*/1 * * * * /usr/local/jdk/bin/java -jar /home/myuser/Desktop/Pre/myjar.jar`
   - code : **java**
   - CronGuard : **run-java-jar** — Exécute un fichier jar Java — toutes les minutes

## Relecture humaine des 77 lignes (2026-11-11)

**Ce qu'affiche CronGuard (nom + rôle + planning du code) est juste : 69/77 = 90 %** (attente ≥ 85 % : remplie).
Faux (8) : 3 (« sauvegarde du système » supposée), 13 (« sur un autre serveur » : la destination est locale), 18 (« source
externe » supposée), 27 (« emails en masse à Martin Thoma » : c'est un paramètre client), 39 (**erreur du CODE** : « à 24:00 »
pour une heure invalide — corrigé, le code signale maintenant une expression invalide), 45 (« envoie des emails » inventé),
54 (« mise à niveau » deviné d'up427), 66 (« script PHP » pour un .sh).
Limites non comptées : 4 rôles en anglais (26, 36, 73, 74), « Redémarre » pour un reload (41).
Plus clair que le nom du code : oui pour la grande majorité (le code donne mysqldump ×4, rsync, python ×4, wget ×6, su ×2,
bash, test, et un nom vide) — attente ≥ 50 % remplie. Rôle rejeté par les garde-fous : 12/77, le nom et le planning restent.
Critique : 96 % (remplie). **Latence 5,6 s (attente ≤ 5 : NON remplie, de 0,6 s).**
