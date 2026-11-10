# Rôle IA n°1 — expliquer une panne établie (2026-11-10)

- **cas** : 28
- **couverture** : 35 % des 80 causes établies (essai 3 : attente ≥ 50 %)
- **fidelite** : 96 % (attente ≥ 95 %)
- **mecanisme_garde** : 96 % sur 26 (attente ≥ 90 %)
- **mots_mediane** : 32 (attente ≤ 60)
- **phrases_max** : 3 (attente ≤ 3)
- **latence_mediane_s** : 12.9 (attente ≤ 8)

## Exemples (à relire)

### mysql-deadlock
- Cause : Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la base en a annulé une (deadlock).
- Explication : Deux transactions ont essayé de verrouiller les mêmes lignes dans un ordre différent, et la base a annulé l'une d'elles en raison d'un deadlock. Pour résoudre le problème, relancez la transaction en prenant toujours les verrous dans le même ordre et en raccourcissant les transactions.

### tls-cert-expired
- Cause : Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu lieu.
- Explication : Le certificat TLS du serveur appelé a expiré, ce qui a provoqué l'erreur. Vous devez renouveler le certificat ou prévenir le tiers concerné. Ne pas désactiver la vérification de la certification.

### watchdog-sigkill
- Cause : Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdog) et a été tué avant la fin.
- Explication : Le job a été interrompu car il a dépassé la durée maximale autorisée. Pour résoudre ce problème, vous pouvez réduire la durée du job ou augmenter la limite de temps si cela est nécessaire. Assurez-vous également que le job peut reprendre correctement en cas de coupure.

### disk-full-enospc
- Cause : Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute de rétention.
- Explication : Le volume de destination est plein en raison de l'accumulation de fichiers (sauvegardes, logs). Il faut libérer de la place en purifiant les anciennes sauvegardes et logs et en configurant une rétention pour le job. Vérifiez le volume avec `df -h` et supprimez les fichiers inutiles.

### inode-exhaustion
- Cause : Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l'espace disque.
- Explication : Le système de fichiers manque d'inodes car il y a trop de petits fichiers. Vous devez purger ou archiver les dossiers contenant de nombreux petits fichiers pour libérer des inodes.

### stripe-rate-limit-429
- Cause : Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est atteinte.
- Explication : Trop de requêtes ont été envoyées à l'API dans la fenêtre autorisée, ce qui a dépassé sa limite de débit. Il faut respecter le délai indiqué dans Retry-After en utilisant un étalement exponentiel des appels et en vérifiant que seul un job utilise la clé API à la fois.

### pub-pg-dump-version-mismatch-cron
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le cron utilise une ancienne version de pg_dump qui ne correspond pas à la version du serveur PostgreSQL. Vous devez utiliser un pg_dump à jour ou spécifier le chemin complet vers le bon binaire.

### pub-gitlab-backup-pg-dump-mismatch
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le binaire pg_dump utilisé par le cron est plus ancien que la version du serveur PostgreSQL, ce qui a causé un conflit de versions. Pour résoudre cela, utilisez une version de pg_dump correspondant à celle du serveur ou appelez directement le bon binaire en chemin absolu.

### pub-mysqldump-lock-tables-privilege
- Cause : Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump.
- Explication : Le compte de sauvegarde n'a pas les privilèges nécessaires pour utiliser LOCK TABLES. Vous pouvez soit ajouter l'option --single-transaction à la commande mysqldump si vous utilisez des tables InnoDB, soit accorder le droit GRANT LOCK TABLES au compte du cron.

### pub-weaviate-x509-legacy-cn
- Cause : Le certificat ne couvre pas ce nom d'hôte dans ses SAN (Subject Alternative Names) ; le Common Name seul n'est plus accepté.
- Explication : Le serveur ne reconnaît pas le nom d'hôte utilisé pour accéder aux données. Le certificat ne couvre pas ce nom dans ses SAN (Subject Alternative Names). Vous devez régénérer le certificat avec les bons SAN ou appeler l'hôte par un nom qu'il couvre.

### pub-aws-s3-sync-sso-expired
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job a échoué car les identifiants de session (SSO) utilisés sont expirés. Vous devez donner au job des identifiants durables, comme un rôle d'instance ou un compte de service.

### pub-s3-upload-expired-token
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job a échoué car les identifiants cloud temporaires utilisés sont expirés. Vous devez donner au job des identifiants durables ou les rafraîchir avant leur expiration.

### pub-node-heap-oom-backup
- Cause : Le traitement charge plus de données que la limite de tas Node.js par défaut.
- Explication : js. Pour résoudre le problème, vous pouvez traiter les données par lots ou augmenter la taille du tas avec NODE_OPTIONS=--max-old-space-size, sans dépasser la capacité de votre RAM.

### p2-rake-path-rvm — ❌ inventé : /usr/local/bin.
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'rake' ne peut pas être trouvée car cron démarre avec un PATH minimal qui ne contient pas /usr/local/bin. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p2-docker-no-space
- Cause : Le disque de Docker est plein : conteneurs arrêtés, images et volumes anonymes s'accumulent à chaque exécution (docker run sans --rm).
- Explication : Le disque est plein car Docker accumule des conteneurs, images et volumes non supprimés. Nettoyez le système Docker avec `docker system prune` et `docker volume prune`. Lors de l'exécution des conteneurs, ajoutez l'option `--rm`.

### p3-venv-env-var
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : La variable SOME_ENV_VARIABLE nécessaire au job n'existe pas sous cron car elle est définie dans votre shell et non dans un fichier que cron charge. Pour résoudre ce problème, vous pouvez définir la variable en tête de la crontab ou charger explicitement le fichier d'environnement dans le script.

### p3-node-full-path
- Cause : cron lance la commande avec /bin/sh (dash sur Debian/Ubuntu), qui refuse la syntaxe bash ([[ ]], source, tableaux, ${…/…}).
- Explication : Le cron utilise /bin/sh (dash) qui ne supporte pas certaines syntaxes bash comme [[ ]]. sh ou ajoutez SHELL=/bin/bash en tête de la crontab.

### p4-rsync-process-subst-sh
- Cause : La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh, qui ne la comprend pas.
- Explication : La commande utilise des fonctionnalités bash spécifiques qui ne sont pas supportées par sh. sh' ou définissez SHELL=/bin/bash dans votre crontab.

### p4-npm-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron ne peut pas trouver la commande npm car son chemin n'est pas dans le PATH minimal. Vous devez appeler npm en chemin absolu ou définir PATH= en tête de la crontab.

### p4-java-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande java n'est pas trouvable dans le PATH minimal utilisé par cron. Vous devez appeler la commande en chemin absolu ou définir le PATH en tête de la crontab.

### p4-gsutil-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande gsutil est introuvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p4-date-percent
- Cause : La commande contient un % non échappé : dans une crontab, % est un saut de ligne, la commande est coupée à cet endroit.
- Explication : La crontab contient une commande avec un % non échappé, ce qui fait que la commande est interrompue prématurément. Pour corriger cela, échappez chaque % en \\

### p4-php-relative-require
- Cause : Le job ouvre un fichier par un chemin relatif : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script, donc le chemin ne pointe plus au bon endroit.
- Explication : Le script tente de charger un fichier dans un répertoire qui n'est pas le bon car le chemin relatif ne fonctionne pas sous cron. Utilisez des chemins absolus pour résoudre ce problème.

### p4-bundle-path-environment
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p4-cron-no-user-var — ⚠ mécanisme perdu
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : bashrc. Pour résoudre cela, vous devez définir la variable en tête de la crontab ou charger explicitement le script environnemental dans votre tâche cron.

### p5-crontab-percent-expr
- Cause : Le journal de cron montre la commande coupée juste avant un % : dans une crontab, % est un saut de ligne, la suite de la commande n'est jamais exécutée.
- Explication : La commande dans le crontab est interrompue juste avant un %. Cela se produit car % représente un saut de ligne dans les expressions cron. Pour résoudre ce problème, vous pouvez échapper chaque % en utilisant \\.

### p5-unixcat-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande unixcat n'est pas trouvée car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p6-rake-bundle-env
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.
