# Rôle IA — questions pour enquêter (2026-11-11)

- **cas** : 37
- **avec_question** : 97 % (attente ≥ 70 %)
- **brutes_sans_invention** : 99 % de 75 (attente ≥ 95 %)
- **pointe_la_cause** : 19 % de 37 étiquetés (attente ≥ 30 %)
- **latence_mediane_s** : 8.3 (attente ≤ 20)

## Cas (relecture humaine des 20 premiers)

### 1. typeerror-undefined-prop
- Erreur : TypeError: Cannot read properties of undefined (reading 'tier') ⏎ [ERROR] 0 / 8114 statements generated
- ✓ Quel est le chemin du fichier où se trouve cette erreur ?
- ✓ Quelle commande a généré cette erreur ?


### 2. python-keyerror
- Erreur : KeyError: 'gross_amount_eur' ⏎ Reconciliation aborted — 0 transactions matched
- ✓ Quel est le chemin exact du fichier où cette erreur apparaît ?
- ✗ La commande exécutée était-elle 'reconcile' ou quelque chose de similaire ?

### 3. syntax-error-bad-deploy
- Erreur : SyntaxError: Unexpected token ';'
- ✓ Quel est le chemin du fichier où se trouve l'erreur ;?
- ✗ Quelle commande as-tu exécutée juste avant ce fichier ?

### 4. unhandled-rejection-null-order
- Erreur : [ERROR] Unhandled promise rejection ⏎ TypeError: Cannot destructure property 'items' of 'order' as it is null.
- ✓ Quelle commande précise a généré cette erreur ?
- ✗ Quel est le chemin exact du fichier où se trouve la commande en question ? 

### 5. validation-null-ids — pointe la cause
- Erreur : [ERROR] 84,112 records with NULL customer_id (expected 0) ⏎ [ERROR] 3,402 records with order_total < 0
- ✓ Combien de records avec customer_id NULL étaient-vous censé avoir selon l'erreur ?
- ✓ Quel est le chemin ou la table concernée par les erreurs 'records with NULL customer_id' et 'records with order_total < 0' ?


### 6. schema-drift-extra-column — pointe la cause
- Erreur : Error: Parquet schema mismatch: source has 14 columns, target table has 13 ⏎ COPY aborted — 0 / 9,442,801 events loaded
- ✓ Quel est le nombre de colonnes dans la table cible mentionné dans l'erreur ?
- ✗ Quelle commande COPY a-t-on essayé d'exécuter ?

### 7. pub-borg-not-found-cron-path — pointe la cause
- Erreur : ERROR: BORG is not installed on this system!
- ✓ Quel est le chemin du script qui génère cette erreur ?
- ✗ Avez-vous vérifié si la commande 'BORG' est bien disponible dans votre environnement de commande ?

### 8. p2-cron-malware
- Erreur : Dec 19 00:00:01 localhost systemd[1]: cron.service: Unit entered failed state. ⏎ Dec 19 00:00:01 localhost systemd[1]: cron.service: Failed with result 'signal'.
- ✓ Quel processus a été tué selon le message d'erreur ?
- ✗ Quelle est la unit concernée par l'échec ? 

### 9. p2-spring-sftp-duplicate
- Erreur : 2024-09-13T10:50:02.499-04:00 ERROR 16323 --- [some-service] [   scheduling-1] o.s.integration.handler.LoggingHandler   : org.springframework.messaging.MessagingException: Problem occurred while synchronizing '/remote-file-path' to local directory
- ✓ Quel est le chemin exact mentionné dans l'erreur ?
- ✗ Quelle commande est exécutée pour la synchronisation des fichiers ?

### 10. p2-php-oom-ssh-safe-mode
- Erreur : Fatal error: Out of memory (allocated 20185088) (tried to allocate 71 bytes)
- ✓ Quel est le chemin du fichier où se trouve cette erreur ?
- ✗ Quelle quantité de mémoire a-t-elle essayé d'alouer ?

### 11. p3-ruby-rvm-env
- Erreur : Dec  3 20:12:01 dahlia /USR/SBIN/CRON[13910]: (CRON) error (grandchild #13912 failed with exit status 1)
- ✓ Quelle commande spécifique a échoué avec un code d'erreur 1 ?
- ✗ Quel est le chemin de la tâche planifiée échouée dans le journal CRON ?

### 12. p3-mysqldump-password-unquoted
- Erreur : sh: 1: Gp+cYE2!6z: not found
- ✓ Quel est le chemin exact de la commande 'Gp+cYE2!6z' mentionnée dans l'erreur ?
- ✓ Pourquoi ce code 'Gp+cYE2!6z' semble-t-il ne pas être trouvé ?


### 13. p3-rsync-e-quotes
- Erreur : rsync: link_stat "/var/opt/base.sql" failed: No such file or directory (2) ⏎ rsync error: some files could not be transferred (code 23) at /BuildRoot/Library/Caches/com.apple.xbs/Sources/rsync/rsync-54/rsync/main.c(996) [sender=2.6.9]
- ✓ Quel est le chemin '/Users/yyyyy_yyyyy/.ssh/lxxxxxxxxx@1xx.1xx.1xx.1xx' censé être dans votre système?
- ✓ Pourquoi les fichiers '/var/opt/base.sql' sont-ils absents de votre système?
- ✓ Quelle version d'rsync rencontrez-vous ('sender=2.6.9') et est-ce la bonne pour cette tâche?


### 14. p3-tar-path-spaces
- Erreur : tar: /opt/lampp/htdocs/abc/app/2014_07_09/con_2014.07.09.54.168668034.tar: Cannot open: No such file or directory ⏎ tar: Error is not recoverable: exiting now
- ✓ Pourquoi le fichier /opt/lampp/htdocs/abc/app/2014_07_09/con_2014.07.09.54.168668034.tar n'existe-t-il pas ?
- ✗ Quel est le chemin exact du fichier que tar essaie d'ouvrir ? 

### 15. p3-venv-activate-path
- Erreur : ImportError: Could not import settings 'myproj.settings ⏎ ' (Is it on sys.path? Is there an import error in the settings file?): No module named settings
- ✓ Avez-vous vérifié que le dossier contenant les settings se trouve bien dans sys.path?
- ✗ Quel est le chemin exact du fichier settings.py de votre projet myproj?

### 16. p3-notify-send-display
- Erreur : ** (other.py:16509): WARNING **: Command line `dbus-launch --autolaunch=91bdcc4a583bfb56734fbe1200000010 --binary-syntax --close-stderr' exited with non-zero exit status 1: Autolaunch error: X11 initialization failed.\n
- ✓ Quel est le chemin complet de la commande 'other.py' mentionnée dans l'erreur ?
- ✓ Quelle est la cause du message d'erreur 'X11 initialization failed' ?


### 17. p4-python-version-cron — pointe la cause
- Erreur : SyntaxError: invalid syntax
- ✓ Quel est le chemin du fichier où ce message d'erreur a été généré ?
- ✓ Quelle commande as-tu exécutée qui a provoqué cette erreur ?


### 18. p4-laravel-mail-template
- Erreur : [2018-09-11 10:16:01] local.ERROR: exception 'ErrorException' with message 'Undefined variable: errors' in /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php:24 ⏎ #0 /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php(24): Illuminate\Foundation\Bootstrap\HandleExceptions->handleError(8, 'Undefined varia...', '/var/www/html/v...', 24, Array)
- ✓ Quel est le chemin du fichier où l'erreur a été générée : /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php ?
- ✓ Quelle ligne de ce fichier contient l'erreur : 24 ?


### 19. p4-sh-run-by-python
- Erreur : SyntaxError: invalid syntax
- ✓ Quel est le chemin du fichier où ce message d'erreur a été généré ?
- ✓ Quelle commande as-tu exécutée qui a provoqué cette erreur ?


### 20. p4-display-xauthority — pointe la cause
- Erreur : RuntimeError: could not open display
- ✓ Quel est le chemin de l'application qui génère cette erreur ?
- ✓ La commande 'could not open display' se rapporte-t-elle à une session X11 ?


### 21. p5-svn-sshpass-noninteractive — pointe la cause
- Erreur : if [ -n "$errors" ] ⏎ printf 'auto_update_svn.bash:\n%s UTC\n'"$errors"'\n\n' "$sDa
- ✓ Quel est le chemin de la commande svn dans l'erreur ?
- ✓ Quelle option peut être utilisée pour activer les demandes interactives d'authentification ?


### 22. p5-perl-env-login-shell
- Erreur : Can't continue after import errors at -e line 1. ⏎ BEGIN failed--compilation aborted at -e line 1.
- ✓ Quel est le chemin complet de la commande qui a échoué ?
- ✓ Quelle erreur précise est mentionnée dans les lignes d'erreur ?


### 23. p5-php-set-time-limit
- Erreur : /var/log/php_errors.log ⏎ [01-Mar-2012 00:32:57 UTC] PHP Fatal error: Maximum execution time of 60 seconds exceeded in /path/file.php on line 2079
- ✓ Quel est le contenu de la ligne 2079 du fichier /path/file.php ?
- ✓ Le fichier /var/log/php_errors.log contient-il d'autres erreurs ou avertissements avant celle mentionnée ?


### 24. p5-macos-tcc-trash
- Erreur : except Exception as _err: ⏎ logging.exception(_err)
- ✓ Quel est le chemin exact où l'erreur de permission s'est produite ?
- ✓ Quelle commande spécifique a généré cette erreur de permission ?


### 25. p5-wget-ssl-status5
- Erreur : grandchild #20349 failed with status 5
- ✓ Quel est le code 5 correspondant à l'erreur?
- ✓ Le chemin http://domain:8280/folder/cron.php a-t-il été correctement résolu?


### 26. p6-sysctl-path
- Erreur : sh: sysctl   Command Not Found
- ✓ Quel est le chemin exact où la commande 'sysctl' est censée être trouvée ?
- ✓ Pourquoi la commande '/usr/bin/python2.7 ~/.../script.py' échoue-t-elle avec l'erreur 'Command Not Found' pour 'sysctl' ?


### 27. p6-rvm-gem-path
- Erreur : /Users/sam/deggy/onlineGW.rb:3:in `require': no such file to load -- nokogiri (LoadError)
- ✓ Quel est le chemin exact où se trouve le fichier 'nokogiri'?
- ✓ La ligne 3 du fichier '~/deggy/onlineGW.rb' contient quelle commande de require?


### 28. p6-php-unlink-cwd
- Erreur : PHP Warning:  unlink(test.zip) [<a href='function.unlink'>function.unlink</a>]: No such file or directory in /home/MYUSER/public_html/MYSITE/modules/mod_module_gen/cron.php on line 18
- ✓ Quel est le chemin exact mentionné dans l'erreur ?
- ✓ Sur quelle ligne du fichier cron.php se trouve la commande 'unlink(test.zip)' ?


### 29. p6-meteor-fiber — pointe la cause
- Erreur : Error: Can't wait without a fiber
- ✓ Quel est le chemin du fichier où se trouve cette erreur ?
- ✓ La commande 'Can't wait without a fiber' fait-elle référence à une commande spécifique dans votre script ?


### 30. p6-date-unquoted-format
- Erreur : awk -vDate=`date +%b %d %H:%M:%S %Y` -vDate2=`date --date="2 minutes ago" +%b %d %H:%M:%S %Y` '$5 > Date && $5 < Date2' /var/log/dummy.log  | grep "Fatal"
- ✓ 'Date' et 'Date2' contiennent respectivement quelle information ?
- ✗ Quel est le chemin du fichier log utilisé dans la commande awk ? 

### 31. p6-sphinx-path
- Erreur : Sphinx cannot be found on your system. You may need to configure the following
- ✓ Quel est le chemin indiqué dans la ligne d'erreur ?
- ✓ Quelle commande a retourné un code de sortie de 1 ?


### 32. p6-selenium-firefox-version
- Erreur : selenium.common.exceptions.WebDriverException: Message: Can't load the profile. Profile Dir: /tmp/tmpaQkqJv If you specified a log_file in the FirefoxBinary constructor, check it for details.
- ✓ Quel est le chemin du dossier de profil mentionné dans l'erreur ?
- ✓ Quelle commande a échoué avec un code de sortie de 1 ?


### 33. p7-php-killed-oom
- Erreur : Killed
- ✓ Quel processus a été tué selon le message 'Killed' ?
- ✓ Avez-vous vérifié les permissions sur le chemin spécifié dans l'erreur ?


### 34. p7-crontab-and-chained-line
- Erreur : /bin/ash: */5: not found
- ✓ Quel est le chemin de la commande */5 mentionnée dans l'erreur ?
- ✓ Pourquoi un code de sortie 1 a-t-il été généré ?


### 35. p7-k8s-busybox-no-kubectl
- Erreur : Reason:       Error ⏎ Pods Statuses:  0 Running / 0 Succeeded / 0 Failed
- (aucune question acceptée)
- ✗ Quel est le chemin complet du conteneur échoué ? 
- ✗ Quelle commande a été utilisée pour démarrer le conteneur ? 

### 36. p7-php-relative-backup-dir
- Erreur : sh: site-backups/CLIENT_DIRECTORY/DB_DUMP_FILE.sql: No such file or directory
- ✓ Quel est le chemin exact du fichier SQL qui provoque l'erreur ?
- ✓ Pourquoi le fichier DB_DUMP_FILE.sql n'est-il pas trouvé dans le répertoire site-backups/CLIENT_DIRECTORY ?


### 37. p7-readonly-fs-errors
- Erreur : Jun 26 10:07:07 mal kernel: [  529.846663]          res 41/40:00:ec:47:91/00:00:14:00:00/00 Emask 0x409 (media error) <F> ⏎ Jun 26 10:07:07 mal kernel: [  529.846666] ata1.00: error: { UNC }
- ✓ Quel est le chemin du journal des erreurs mentionné dans la ligne d'erreur 'ata1.00: READ LOG DMA EXT failed, trying PIO'?
- ✓ Quel message d'erreur spécifique est affiché lors de la tentative de lecture DMA ?


## Relecture humaine des 20 premiers cas (2026-11-11) — NON REMPLIE

- **Utiles : ~5/20 (25 %)**, pour une attente ≥ 70 %. Utiles : 5 (valeurs NULL), 12 (« pourquoi ce code n'est-il pas trouvé » : c'est le mot de passe coupé), 13 (fichier absent), 14, 20 (session X11).
- Les autres sont génériques ou demandent ce que le technicien sait déjà : « Quel est le chemin du fichier où se trouve cette erreur ? », « Quelle commande a généré cette erreur ? » (cas 1, 2, 3, 4, 9, 10, 11, 17, 19…).
- Cause affirmée en douce : 0/20 (« Quelle est la cause du message… » au cas 16 est une question vide, pas une affirmation).
- **Défaut du garde-fou trouvé** : les en-têtes français des faits (« Commande », « Lignes d'erreur ») comptaient comme éléments cités ; « commande » et « erreur » ancraient donc des questions vides. Le taux de 97 % est gonflé par ce défaut.

Conclusion : un 7B pose des questions de forme correcte, mais pas des questions qui font avancer l'enquête. Rôle non branché.
