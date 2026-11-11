# Rôle IA — réécrire le compte rendu de correction (2026-11-11)

- **cas** : 60
- **acceptees** : 70 % (attente ≥ 70 %)
- **brutes_sans_invention** : 98 % (attente ≥ 95 %)
- **rejet_identifiant_perdu** : 16
- **mots_mediane** : 30 contre 46 à l'origine (attente ≤ 60 et plus court)
- **latence_mediane_s** : 13.1

## Réécritures acceptées (relecture humaine des 20 premières)

### 1. https://serverfault.com/questions/295584/php-cli-memory-limit
- Origine : IIRC, an unlimited memory_limit isn't supported by the CLI (I'll try to find a source for this) but for now, try passing it into the command: php -d memory_limit=128M my_script.php UPDATE Apparently I was dreaming about the unlimited memory_limit not being supported for php cli. Regardless, it looks like the value from the ini is ignored. The simplest solution should then be to specifically set it in the php command calling the script. UPDATE2 To answer the question of where the memory limit is coming from, it's most likely being set in the script itself using 'ini_set'.
- Réécrit : Essaie de passer la limite de mémoire dans la commande : php -d memory_limit=128M my_script.php UPDATE Il semble que la valeur de l'ini soit ignorée. La solution la plus simple devrait être de spécifier cette limite directement dans la commande PHP appelant le script. UPDATE2 Vérifie si la limite de mémoire est définie dans le script lui-même avec ini_set.

### 2. https://serverfault.com/questions/78159/what-could-cause-permission-denied-for-command-crontab-e
- Origine : Does /usr/bin/crontab have the setgid permission set? -rwxr-sr-x 1 root crontab 32K 2008-09-28 14:07 /usr/bin/crontab* If not, chmod g+s it (and if needed, chown before that) Edit: Note that this only applies to Vixie Cron (used by most distros); other daemons (such as dcron) may use different permissions (setuid).
- Réécrit : Vérifiez si /usr/bin/crontab a le permission setgid activée -rwxr-sr-x 1 root crontab 32K 2008-09-28 14:07 /usr/bin/crontab. Si ce n'est pas le cas, exécutez chmod g+s /usr/bin/crontab (et si nécessaire, chown avant cela). Notez que cela ne s'applique qu'à Vixie Cron (utilisé par la plupart des distributions) ; d'autres daemons (comme dcron) peuvent utiliser des permissions différentes.

### 3. https://serverfault.com/questions/619296/crontab-listing-or-editing-results-in-fopen-permission-denied
- Origine : The permissions on /usr/bin/crontab should be: owner=root group=root perms= 4755 (rws rx rx) Your /usr/bin/crontab has the wrong group owner. Additionally, it has sgid and NOT suid which it must have.
- Réécrit : Vérifiez que les permissions sur /usr/bin/crontab sont : propriétaire=root groupe=root perms=4755 (rws rx rx). Assurez-vous également que le groupe est correct et que l'attribut sgid est présent mais suid n'est pas nécessaire.

### 4. https://serverfault.com/questions/436048/crontab-running-before-nfs-mounted
- Origine : You can use the mountpoint command to ensure the mount has taken place before you execute your command e.g. (assuming /abs is the mount point) #!/bin/bash while true do if mountpoint -q /abs then /usr/bin/python /abs/path/to/script.py break fi sleep 10 done
- Réécrit : Utilisez la commande mountpoint pour vous assurer que le montage a eu lieu avant d'exécuter votre commande, par exemple : #!/bin/bash
Tant que c'est nécessaire,
 vérifiez si le point de montage /abs est monté avec mountpoint -q /abs. Si c'est le cas, exécutez /usr/bin/python /abs/path/to/script.py et interrompez la boucle. Sinon, attendez 10 secondes avant de réessayer.

### 5. https://serverfault.com/questions/19843/change-default-crontab-editor-to-nano-in-freebsd
- Origine : For sh based shells: export EDITOR=/path/to/nano For C shell based: setenv EDITOR /path/to/nano Remember that unless you save these setting to your login profile script (/home/user/.bash_profile for example), you lose the setting at log out. If I remember correctly, FreeBSD uses C shell as the default user shell.
- Réécrit : export EDITOR=/path/to/nano
setenv EDITOR /path/to/nano
Sauvegardez ces paramètres dans votre script de profil de connexion (/home/user/.bash_profile par exemple)
Attention, FreeBSD utilise probablement le shell C par défaut.

### 6. https://serverfault.com/questions/368009/escaping-characters-in-cron
- Origine : I'll expand on what SvenW said by stating that I would put this command into a script for two reasons: It avoids any issues with escaping characters in crontab. It allows you to clearly indicate to your fellow administrators what the job does without wasting any of their cycles decrypting the one-liner magic you've created. Such as calling the script /root/bin/dump_mysql_tables_and_email_failure_report.sh. You may not be in an environment with other administrators, but this will serve to remind you what the heck you were thinking a year from now! :)
- Réécrit : Créez un script pour exécuter cette commande afin d'éviter les problèmes d'échappement de caractères dans crontab. Nommez ce script /root/bin/dump_mysql_tables_and_email_failure_report.sh pour clarifier son utilité aux administrateurs futurs.

### 7. https://serverfault.com/questions/853364/cron-and-crontab-are-missing-in-docker-image-of-ubuntu-16-04
- Origine : The cron command is not installed by default in the image ubuntu:16.04 Need to run apt-get install cron
- Réécrit : Installez cron avec la commande : apt-get install cron

### 8. https://serverfault.com/questions/777163/how-to-use-keep-environment-option-in-exim-4-on-debian
- Origine : On Debian you can set the macro MAIN_KEEP_ENVIRONMENT = in /etc/exim4/conf.d/main/01_exim4-config_listmacrosdefs or where ever you set your macros. See: /usr/share/doc/exim4/changelog.Debian.gz
- Réécrit : Editez le fichier /etc/exim4/conf.d/main/01_exim4-config_listmacrosdefs ou l'emplacement où vous définissez vos macros. Définissez la macro MAIN_KEEP_ENVIRONMENT = . Consultez le changelog en exécutant : less /usr/share/doc/exim4/changelog.Debian.gz

### 9. https://serverfault.com/questions/98280/pptp-pon-fails-when-called-via-cron-debian
- Origine : The error message you posted sort of points to a bug in pppd, however the situation you described "works from shell but not from cron" is usually related to path issues. since it can't hurt, can you try adding this to the top of your crontab? PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin edit: one workaround you could use, is if it always works from the shell, have another short script that does a while true;do vpnup.sh;sleep 1m;done >> log then you can just start that in screen with something like screen -S vpn -d -m thatscript
- Réécrit : Ajoutez cette ligne au début de votre crontab : PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Modifiez le script en ajoutant un while true;do vpnup.sh;sleep 1m;done >> log
Démarrez ce script avec screen -S vpn -d -m thatscript

### 10. https://serverfault.com/questions/401311/cron-job-errors-with-no-such-file-or-directory-even-when-the-file-does-actuall
- Origine : You are trying to execute a script which does not have a valid shebang. Add the shebang as the first line of the script like this (adjust path of course): #!/usr/bin/php Or change the crontab entry to: 15 * * * * /usr/bin/php /Applications/MAMP/htdocs/iconimageryidx/includes/insertPropertyRESI.php
- Réécrit : Ajoutez le shebang comme premier ligne du script : #!/usr/bin/php
Modifiez l'entrée crontab en : 15 * * * * /usr/bin/php /Applications/MAMP/htdocs/iconimageryidx/includes/insertPropertyRESI.php

### 11. https://serverfault.com/questions/190871/gpg-doesnt-work-in-crontab
- Origine : Add -vv to the gpg command to see more output. It might have to do with a missing ~/.gnupg though.
- Réécrit : Ajoute -vv à la commande gpg pour avoir plus de détails. Vérifie le dossier ~/.gnupg.

### 12. https://serverfault.com/questions/408331/users-cannot-use-crontab-after-password-security-upgrade
- Origine : I managed to fix this moments after posting the question. It turns out that the /etc/shadow entries for the affected MD5 password users had somehow had the field after the hashed password duplicated, causing PAM to be unable to interpret the line. In other words, a bad cut and paste job. I haven't had enough coffee...
- Réécrit : Vérifiez les entrées /etc/shadow pour les utilisateurs concernés. Supprimez le champ dupliqué après le mot de passe hashé. Réessayez la connexion des utilisateurs.

### 13. https://serverfault.com/questions/642737/cron-daemon-reporting-unknown-user-tomcat6-every-day-since-i-removed-tomcat
- Origine : This is the logrotate software (that, as the name says, "rotate" logs) complaining about a non-existent user configured to rotate your tomcat logs. Try searching the /etc/logrotate.d/ directory for something like "tomcat" or "tomcat6" and remove the file if you find it, it's useless now that tomcat is not installed anymore.
- Réécrit : Recherchez le dossier /etc/logrotate.d/ pour trouver un fichier comme 'tomcat' ou 'tomcat6'. Supprimez ce fichier s'il existe, car il est inutile maintenant que tomcat n'est plus installé.

### 14. https://serverfault.com/questions/593382/hg-pull-from-bitbucket-fails-when-run-from-cron
- Origine : Try specifying the ssh command explicitly e.g. hg pull -e 'ssh -i /location/of/key' Cron runs with a minimal shell, so won't have access to your ssh-agent process because the SSH environment variables aren't set.
- Réécrit : Spécifiez explicitement la commande ssh par exemple : hg pull -e 'ssh -i /location/of/key'. Les tâches planifiées s'exécutent avec un shell minimal, donc ne peuvent pas accéder au processus de votre agent ssh-agent car les variables d'environnement SSH ne sont pas définies.

### 15. https://serverfault.com/questions/299588/bash-script-works-from-prompt-but-not-from-cron
- Origine : You need to escape the % signs in the crontab entry if you use backticks (`) in crontab. like this: /home/backup.sh > /home/webserver/logs/BackupLog-`date +\%m\%d\%y`.log They are treated as newline if you dont escape them.
- Réécrit : Échappez les signes % dans l'entrée crontab si vous utilisez des backticks (`). Par exemple : /home/backup.sh > /home/webserver/logs/BackupLog-`date +%m%d%y`.log Les % seront traités comme de nouveaux lignes si vous ne les échappez pas.

### 16. https://serverfault.com/questions/209963/determine-problem-with-cron-not-running
- Origine : You've got a few options, not in any particular order. Run the command that you have in crontab on the command line. This can be deceptive since oftentimes this will work for you, and the reason it's not running in cron is a missing environment variable, or something along those lines. Add an output option to your crontab line, for example: 5 */2 * * * /usr/local/bin/do-stuff.sh >> /tmp/results.log; Make sure cron is actually running. Check your cron log files for any particular errors.&nbsp;
- Réécrit : Exécutez la commande qui se trouve dans crontab depuis la ligne de commande. Ajoutez une option d'output à votre ligne crontab, par exemple : 5 */2 * * * /usr/local/bin/do-stuff.sh >> /tmp/results.log. Assurez-vous que cron est en cours d'exécution.

### 17. https://serverfault.com/questions/474178/host-key-verification-failed-rsync-connection-unexpectedly-closed
- Origine : Thank you all....got the answer finally. When I was running it manually I was running as a local user. But, on cron I was running it as root user, for which ssh key was not generated. I did ssh-keygen and created the keys. Now it works.
- Réécrit : Vérifiez que vous exécutez le script en tant qu'utilisateur local lors de la mise en œuvre manuelle. Sur cron, assurez-vous d'exécuter le script en tant qu'utilisateur root et générez les clés SSH avec ssh-keygen.

### 18. https://serverfault.com/questions/305038/centos-php-fpm-cron
- Origine : php-fpm is fastcgi only.. install the php-cli package also edit You have to enable the repo to install yum -y --enablerepo=webtatic install php-cli
- Réécrit : Installez le package php-cli également. Activez le répertoire de dépôt pour installer : 
yum -y --enablerepo=webtatic install php-cli

### 19. https://serverfault.com/questions/307389/crontab-fails-to-set-variable-before-job
- Origine : Moving my comment to a question because apparently it was the right answer! Check what version of cron you are using. It's possible you have some weird non-vixie cron that doesn't accept the same settings or arguments.
- Réécrit : Déplacez votre commentaire vers une question car cela semble être la bonne réponse ! Vérifiez quelle version de cron vous utilisez. Il est possible que vous ayez une version non-vixie de cron qui ne accepte pas les mêmes paramètres ou options.

### 20. https://serverfault.com/questions/650369/cron-daemon-wget-blocked
- Origine : Either remove wget exclusion from the nginx configuration, or add something like this as an option to your wget command: --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:21.0) Gecko/20100101 Firefox/21.0" --referrer whatever.example.com
- Réécrit : Supprimez l'exclusion wget dans la configuration nginx, ou ajoutez ces options à votre commande wget : --user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:21.0) Gecko/20100101 Firefox/21.0" --referrer whatever.example.com

### 21. https://serverfault.com/questions/473890/aws-api-tools-command-not-found-when-executing-from-cron
- Origine : In addition to specifying the full path to the command as @ceejayoz says in the comments, you'll also need to set EC2_HOME to point to your EC2 tools directory, and you may also need to add $EC2_HOME/bin to your PATH in order for referenced files in the command scripts to be picked up correctly. Rather than specifying a bunch of environment variables in your crontab, it's neater and more reliable to create a shell script that sets the environment and calls your command, and then call the script from your crontab.
- Réécrit : Spécifiez le chemin complet de la commande comme indiqué par @ceejayoz dans les commentaires. Définissez EC2_HOME pour pointer vers votre répertoire d'outils EC2, et ajoutez éventuellement $EC2_HOME/bin à votre PATH afin que les fichiers référencés dans les scripts de commande soient correctement pris en compte. Au lieu de spécifier une série d'variables d'environnement dans votre crontab, il est plus net et fiable de créer un script shell qui définit l'environnement et appelle votre commande, puis appelez ce script depuis votre crontab.

### 22. https://serverfault.com/questions/271900/ubuntu-cronjob-failing-with-exit-code-2
- Origine : Your script seems to be exiting with status 2, which cron interprets as an error. Does it exit with status 0 if run by hand? /usr/local/bin/sqlbackup.sh -e echo $? Check you're not assuming things about the environment that aren't true when run by cron. In particular use absolute paths when invoking other scripts or binaries. Try replacing the cron job with sh -x /usr/local/bin/sqlbackup.sh -e - it should then display line-by-line execution info (I haven't ever tried it with cron though).
- Réécrit : Exécutez le script manuellement et vérifiez s'il sort avec un statut 0. Utilisez l'option -e echo $? dans /usr/local/bin/sqlbackup.sh pour obtenir le statut de sortie. Assurez-vous que vous n'avez pas fait d'hypothèses sur l'environnement qui ne sont pas vraies lorsqu'il est exécuté par cron.

### 23. https://serverfault.com/questions/893460/crontab-user-is-interpreted-as-command
- Origine : Only the system-wide crontab file (usually /etc/crontab) and other system crontab files (usually /etc/cron.d) have the username field. User crontab files don't have this field. See man 5 crontab [...] regular system-wide crontab file. Unlinke a user's crontab, this file has the username field, as used by /etc/crontab.
- Réécrit : Vérifiez le fichier système crontab global (généralement /etc/crontab) et d'autres fichiers crontab du système (généralement /etc/cron.d). Ces fichiers contiennent le champ username, contrairement aux fichiers crontab utilisateur.

### 24. https://serverfault.com/questions/120928/running-rsync-script-from-cron-not-recognizing-max-size-parameter
- Origine : You may have two different versions of rsync. The $PATH is different in cron than at the command line. Try type -a rsync to show the locations of the executables. Then use the full path designation to the correct version in your script. /path/to/rsync rsync_options ...
- Réécrit : Exécutez type -a rsync pour afficher les emplacements des exécutables. Utilisez ensuite le chemin complet de la bonne version dans votre script. Par exemple : /path/to/rsync rsync_options ...

### 25. https://serverfault.com/questions/1010968/get-an-email-notification-when-my-cron-fails-with-non-zero-exit-code-crontab
- Origine : if the "mail" part succeeds then the cron job has succeeded (and thus the code is zero) 00 19 * * * bash /home/test/take_backup.sh > /home/test/backup.log 2>&1 || ( mail -s "Backup failed, check attached logs" someone@gmail.com < /home/test/backup.log && false )
- Réécrit : Si la partie 'mail' réussit, alors la tâche cron a réussi (donc le code est zéro). 00 19 * * * bash /home/test/take_backup.sh > /home/test/backup.log 2>&1 || ( mail -s "Backup failed, check attached logs" someone@gmail.com < /home/test/backup.log && false )

### 26. https://serverfault.com/questions/221652/how-to-stop-cron-from-sending-messages-about-errors
- Origine : You should check to make sure the lynx binary is in one of the locations specified in the PATH variable, or use the full path to the binary in the cron line. To surpress the errors, you want to redirect STDERR and STDOUT to /dev/null, like so: */5 * * * * lynx -dump http://www.domain.com/cron/realqueue >/dev/null 2>&1 The first redirection sends STDOUT to /dev/null, and the second sends STDERR with STDOUT (that is, to /dev/null).
- Réécrit : Vérifiez que le fichier exécutable lynx se trouve dans l'une des chemins spécifiés par la variable PATH. Sinon, utilisez le chemin complet vers le fichier en crontab. Pour supprimer les erreurs, redirigez STDOUT et STDERR vers /dev/null comme ceci : */5 * * * * lynx -dump http://www.domain.com/cron/realqueue >/dev/null 2>&1

### 27. https://serverfault.com/questions/210452/crontab-commands-not-running
- Origine : Your crontab needs a username for the last line (mysqlcheck). And: you might want to change that MySQL root password now.
- Réécrit : Ajoutez un nom d'utilisateur pour le dernier ligne concernant mysqlcheck. Changez également le mot de passe root MySQL.

### 28. https://serverfault.com/questions/229686/centos-cron-job-running-php-file
- Origine : You're missing the call to the php binary in your cron, it should look like this ### Delete Records 5 * * * * php -q /var/www/html/phpsysinfo/cronUpdateLeadBucketOnEnergycAlliance.php Please substitute php with php-cli depending on how the php command line binary is named on your distribution :)
- Réécrit : Insérez la commande PHP dans le cron : php -q /var/www/html/phpsysinfo/cronUpdateLeadBucketOnEnergycAlliance.php

### 29. https://serverfault.com/questions/208052/etc-cron-daily-apt-segmentation-fault
- Origine : This is a known bug in the python-apt library, documented in Ubuntu bug 664514. Upstream has released a bug-fix, but Ubuntu hasn't assigned this to anyone to fix. More information and interim packages which fix this problem until Ubuntu releases a fix.
- Réécrit : Recherchez le bug documenté sous le numéro 664514 sur la plateforme Ubuntu. Installez les paquets temporaires fournis jusqu'à ce que Ubuntu libère une version corrigée.

### 30. https://serverfault.com/questions/1106696/cannot-add-cron-task
- Origine : You want to just run crontab -e and then hit Enter. Then your crontab will appear in the editor that is configured in your environment. In the editor, you can then add the line to the crontab that you want to add: 0 12 * * * /usr/bin/certbot renew -quiet The problem is your trying to do two steps in one.
- Réécrit : Ouvrez le fichier crontab en édition avec la commande crontab -e. Ajoutez ensuite la ligne suivante dans l'éditeur : 0 12 * * * /usr/bin/certbot renew -quiet.

### 31. https://serverfault.com/questions/866010/lets-encrypt-certbot-auto-setuptools-version-error-when-run-from-cron
- Origine : This is the issue: HOME=/ To fix it HOME variable with /root value needs to be passed to the script: env HOME=/root /path/to/certbot-auto
- Réécrit : Corriger l'erreur nécessite de passer la valeur du variable HOME avec /root à la commande : env HOME=/root /path/to/certbot-auto

### 32. https://serverfault.com/questions/465497/edit-crontab-for-apache
- Origine : This is being caused because you have no entry for apache in your /etc/shadow file. It should contain a entry like this apache:!!:15168:::::: I just tested this on a C6.3 system and removing it gives exactly the same error you are seeing.
- Réécrit : Vérifiez que votre fichier /etc/shadow contient une entrée pour apache comme ceci : apache:!!:15168::::::. Je viens de tester cela sur un système C6.3 et son suppression donne exactement le même message d'erreur que vous rencontrez.

### 33. https://serverfault.com/questions/167382/crontab-not-running-my-php-scripts
- Origine : You can use the web version in the cron if GET(lwp-request) or curl is installed on the server GET * * * * * GET http://localhost/cron/sendQueuedEmails.php > /dev/null curl * * * * * curl -o /dev/null http://localhost/cron/sendQueuedEmails.php
- Réécrit : Utilisez la version web dans cron si lwp-request ou curl sont installés sur le serveur GET * * * * * GET http://localhost/cron/sendQueuedEmails.php > /dev/null curl * * * * * curl -o /dev/null http://localhost/cron/sendQueuedEmails.php

### 34. https://serverfault.com/questions/647774/user-crontab-not-accessible
- Origine : The permission for your crontab is wrong, it is owned by an (nonexistant?) user with the uid 1001, not the user gauthier (or you have some further issues with your system if your uid is 1001). Try sudo chown gauthier /var/spool/cron/crontabs/gauthier and see if this fixes this.
- Réécrit : Vérifiez que les permissions de votre crontab sont correctes, elles doivent être propres à l'utilisateur gauthier. Utilisez la commande sudo chown gauthier /var/spool/cron/crontabs/gauthier et vérifiez si cela résout le problème.

### 35. https://serverfault.com/questions/627419/have-a-vagrant-vm-destroy-itself-or-power-off-on-completion-of-a-long-running-ta
- Origine : I haven't used ansible, but if you can configure it to do your "work" as a provisioning step, then a simple vagrant up && vagrant destroy should take care of it. Vagrant will create your VM, start it, provision it (doing your work tasks) then destroy it.
- Réécrit : Configure Vagrant to perform the provisioning step. Run `vagrant up` to create and start the VM. Run `vagrant destroy` to stop and remove the VM.

### 36. https://serverfault.com/questions/52949/logrotate-error-no-file-found-for-var-log-apache-error-log
- Origine : Ok, it seems that it has nothing to do with logrotate. I think the errors you see are from fail2ban which is looking for these files. Try tu run manually the postscript from fail2ban in /etc/logrotate.d/fail2ban (o something like that) and you will see the errors.
- Réécrit : Essayez de lancer manuellement le script postfrome depuis fail2ban dans /etc/logrotate.d/fail2ban et vous verrez les erreurs.

### 37. https://serverfault.com/questions/765254/anacron-fails-to-open-folder-cron-daily
- Origine : Solved. Please check the answer on "superuser" Not sure if I should delete the question on "serverfault"? At least I am not able to mark it as duplicate, sice I only can refer to other server-fault questions.
- Réécrit : Vérifiez la réponse sur superuser. N'oubliez pas de décider si vous devez supprimer votre question sur serverfault. Assurez-vous que vous ne pouvez pas marquer cette question comme une répétition, car vous n'avez le droit que de faire référence à d'autres questions de server-fault.

### 38. https://serverfault.com/questions/43264/how-can-i-create-a-cron-job-to-delete-two-files-every-24-hours
- Origine : It is not recommended to immediately purge logfiles as they may be needed later for debugging, statistics or tracing an intrusion. While log shipping offsite may be overkill in a single VPS scenario, there are better approaches than simply deleting those. I suggest you look into logrotate or cronolog (Probably available as package on CentOS). With these packages you can set up rules how to process logfiles on a (usually) daily basis, like: Keep a week worth of logs, but compress all of them except today's.
- Réécrit : Ne supprimez pas immédiatement les journaux car ils peuvent être nécessaires pour le débogage, les statistiques ou la traçabilité d'une intrusion. Vérifiez si logrotate ou cronolog sont disponibles en tant que paquets sur CentOS. Configurez ces packages pour conserver une semaine de journaux et compresser tous ceux-ci sauf celui d'aujourd'hui.

### 39. https://serverfault.com/questions/939665/crontab-influences-bash-script-if-condition
- Origine : Sometimes, cron jobs don't run with the $PATH that you might be expecting. First and foremost, I would try fully-qualifying the path to your smbclient executable, just to eliminate that as a possibility. Or, explicitly export your PATH in the wrapper script that's called by cron.
- Réécrit : Évitez les problèmes de $PATH pour vos tâches cron en utilisant le chemin complet vers votre executable smbclient. Sinon, assurez-vous d'exporter explicitement votre PATH dans le script wrapper appelé par cron.

### 40. https://serverfault.com/questions/492943/reboot-cron-directive-doesnt-work-on-solaris-what-do-i-use-instead
- Origine : @reboot and similar @ time values are a feature of Vixie cron. Solaris uses the System V version of cron. (Wikipedia reference) Essentially you can't do what you want via the scheduler so will either need a cron job that runs regularly to check if your service is running, or otherwise write an init script (or transient SMF service for Solaris 10).
- Réécrit : Écrivez un script cron qui vérifie si votre service est en cours d'exécution. Sinon, écrivez un script init ou un service SMF pour Solaris 10.

### 41. https://serverfault.com/questions/904237/use-variables-in-paths-in-crontab
- Origine : TL;DR: you can't. according to man 5 crontab The value string is not parsed for environmental substitutions or replacement of variables, thus lines like PATH = $HOME/bin:$PATH will not work as you might expect. cron's parser is not as powerfull as bash's.
- Réécrit : Vérifiez le manuel crontab. Les valeurs ne sont pas interprétées pour les substitutions d'environnement ou de variables, donc des lignes comme PATH = $HOME/bin:$PATH ne fonctionneront pas comme prévu. Le parseur cron n'est pas aussi puissant que celui de bash.

### 42. https://serverfault.com/questions/618453/problems-with-a-php-include-from-the-command-line-or-cronjob
- Origine : include(../scripts/connect.php) Your script is using a relative directory. These are linked to the current working directory. When cron is running your CWD is almost certainly not what you think it is. Either set the CWD in your cron script, or update your PHP code to use use a path relative to themselves. Something like include(realpath(dirname(__FILE__).'/../scripts/connect.php')) perhaps? The rest of your problems are also, almost certainly something related to the specific environment of your cron session being different from the environment when the web server runs the script. Find the differences, and fix them.
- Réécrit : Utilisez realpath(dirname(__FILE__).'/../scripts/connect.php') au lieu de include(../scripts/connect.php). Identifiez et corrigez les différences entre l'environnement de la session cron et celui du serveur web.

## Rejetées

- https://serverfault.com/questions/84430/whats-wrong-with-my-cronjob-syntax-im-trying-to-use-a-backtick — perdu : /bin/sh
- https://serverfault.com/questions/426748/unexpected-eof-while-looking-for-matching-on-cron-job — perdu : /bin/sh
- https://serverfault.com/questions/416119/what-is-the-correct-way-of-getting-crontab-on-centos-6 — perdu : x86_64
- https://serverfault.com/questions/361051/crontab-to-restart-service — perdu : /usr/sbin/service
- https://serverfault.com/questions/277706/cron-fails-with-exit-status-127 — perdu : next_command, /usr/bin, /usr/sbin, path_to_bundle
- https://serverfault.com/questions/318638/my-cron-tasks-report-command-not-found — vide ou trop court
- https://serverfault.com/questions/814769/how-to-silently-broadcast-a-warning-from-a-cronjob-via-wall — perdu : print_banner
- https://serverfault.com/questions/488387/why-doesnt-this-command-work-as-a-cronjob-while-it-works-perfectly-when-typed — perdu : /bin/sh
- https://serverfault.com/questions/441281/command-does-not-execute-in-crontab-while-command-itself-works-just-fine — perdu : /home/me/bin/ec2-automate-backup.sh
- https://serverfault.com/questions/245047/cronjob-not-running — perdu : env_reset
- https://serverfault.com/questions/351613/lots-of-nfs4-reclaim-open-state-lock-reclaim-failed-entries-in-syslog — perdu : nfs4_reclaim_open_state
- https://serverfault.com/questions/473949/bash-script-runs-manually-but-fails-on-crontab — perdu : /usr/bin, /usr/sbin
- https://serverfault.com/questions/950999/sendmail-bash-script-invoked-by-cron-cant-read-from-stdin — perdu : /stackoverflow.com/questions/212965/how-to-read-mutliline-input-from-stdin-into-variable-and-how-to-print-one-out-in
- https://serverfault.com/questions/58327/problems-with-running-a-php-file-to-include-directories-via-linux — inventé : /path/to/votre/script.php, /path/to/votre/include/dir/index.html
- https://serverfault.com/questions/101729/cron-job-erratic-behavior-with-bourne-shell-script — perdu : /bin/sh, /usr/bin, /usr/sbin, /var/log
- https://serverfault.com/questions/424894/cronjob-script-wont-pass-in-mysql-password — perdu : /usr/bin/mysql, /dev.mysql.com/doc/refman/5.6/en/option-files.html
- https://serverfault.com/questions/132778/probems-using-ssh-from-cron — perdu : ssh_env, /.ssh/environment, /usr/bin/ssh-agent, /dev/null, /usr/bin/ssh-add, ssh_agent_pid
- https://unix.stackexchange.com/questions/38951/what-is-the-working-directory-when-cron-executes-a-job — vide ou trop court

## Relecture humaine des 20 premières (2026-11-11) — attente ≤ 10 % déformé : NON REMPLIE (20 %)

Sens déformé (4/20) :
- **3** — sens inversé : l'origine dit que suid est obligatoire et absent ; la réécriture dit « suid n'est pas nécessaire ».
- **9** — une solution de contournement devient une étape obligatoire, et « un autre petit script » devient « modifiez le script ».
- **15** — l'exemple perd ses barres obliques inverses (`date +%m%d%y` au lieu de `date +\%m\%d\%y`) : il montre exactement l'erreur que la correction devait éviter. Le garde-fou ne l'a pas vu.
- **17** — confus : « exécutez en root et vérifiez l'utilisateur local » au lieu de « cron tourne en root, qui n'avait pas de clé SSH ».

Limites (non comptées) : 5 (on ne sait plus quelle commande va avec quel shell), 6 (un exemple de nom devient une consigne), 8 (commande `less` ajoutée), 10 et 16 (« ou » devient « et », une étape perdue), 19 (une phrase hors sujet devient une consigne).

Conclusion : les garde-fous du code contrôlent les identifiants, pas le sens. Une négation inversée ou un « ou » changé en « et » leur échappe. Rôle non branché.
