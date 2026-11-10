# Rôle IA n°1 — expliquer une panne établie (2026-11-10)

- **cas** : 64
- **rejetes_par_garde_fou** : 16
- **couverture** : 80 % des 80 causes établies (essai 3 : attente ≥ 50 %)
- **fidelite** : 100 % (attente ≥ 95 %)
- **mecanisme_garde** : 93 % sur 61 (attente ≥ 90 %)
- **mots_mediane** : 41 (attente ≤ 60)
- **phrases_max** : 3 (attente ≤ 3)
- **latence_mediane_s** : 15.8 (attente ≤ 8)

## Exemples (à relire)

### pg-connection-refused
- Cause : Le serveur PostgreSQL n'écoute pas à cette adresse : service arrêté ou redémarré, ou listen_addresses / pare-feu qui bloque.
- Explication : Le serveur PostgreSQL n'écoute pas à cette adresse pour plusieurs raisons possibles : le service est arrêté ou redémarré, ou bien un pare-feu bloque l'accès. Vous devez vérifier si le service PostgreSQL est en cours d'exécution et s'il écoute sur la bonne interface. Ensuite, relancer le service si nécessaire.

### pg-too-many-connections
- Cause : Toutes les connexions PostgreSQL sont prises (limite max_connections atteinte), souvent par des connexions oubliées ou un pool mal dimensionné.
- Explication : Toutes les connexions PostgreSQL sont prises, souvent en raison de connexions oubliées ou d'un pool mal dimensionné. Il faut libérer les connexions inactives et passer par un pooler comme PgBouncer plutôt que d'augmenter max_connections.

### mysql-deadlock
- Cause : Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la base en a annulé une (deadlock).
- Explication : Deux transactions ont essayé de verrouiller les mêmes lignes dans un ordre différent, et la base a annulé l'une d'elles en raison d'un deadlock. Pour résoudre le problème, relancez la transaction en prenant toujours les verrous dans le même ordre et en raccourcissant les transactions.

### pg-disk-full-wal
- Cause : Le volume de PostgreSQL est plein à cause de pg_wal : un slot de réplication inactif ou un archivage en échec empêche le recyclage des WAL.
- Explication : Le volume de PostgreSQL est plein en raison du fichier pg_wal. Cela peut être dû à un slot de réplication inactif ou à un archivage en échec qui empêche le recyclage des WAL. Vous devez supprimer le slot de réplication abandonné (ou réparer l'archivage) puis libérer ou agrandir le volume, sans toucher directement à pg_wal.

### tls-cert-expired
- Cause : Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu lieu.
- Explication : Le certificat TLS du serveur appelé a expiré, ce qui a provoqué l'erreur. Vous devez renouveler le certificat ou prévenir le tiers concerné. Ne pas désactiver la vérification de sécurité.

### econnreset-mid-transfer
- Cause : L'autre côté a coupé la connexion en cours de route : redémarrage ou timeout côté serveur, équipement réseau qui ferme les connexions longues.
- Explication : La connexion a été coupée en cours de route par l'autre côté, ce qui peut être dû à un redémarrage du serveur distant ou à un timeout. Il est également possible que l'équipement réseau ait fermé les connexions longues. Pour résoudre le problème, relancez le transfert avec la reprise activée et effectuez des tentatives espacées.

### route-unreachable-vpn
- Cause : Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sortant bloqué.
- Explication : La connexion a échoué car il n'y a aucune route vers l'hôte, ce qui peut être dû à un tunnel VPN ou lien réseau défaillant, une route manquante, ou un trafic sortant bloqué. Il faut vérifier le tunnel VPN et la route vers l'hôte (en utilisant 'ip route get <ip>'), ainsi que le pare-feu sortant pour voir si le trafic est autorisé. Relancez ensuite le processus.

### watchdog-sigkill
- Cause : Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdog) et a été tué avant la fin.
- Explication : Le job a été interrompu car il a dépassé la durée maximale autorisée. Pour résoudre ce problème, vous pouvez réduire la durée du job ou augmenter la limite de temps si la durée normale a changé.

### http-client-timeout
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant ne répond pas dans le délai, il pourrait être indisponible, surchargé, affecté par un pare-feu ou un proxy incorrect. Vérifiez l'état du service et réessayez avec un délai exponentiel.

### query-statement-timeout
- Cause : La requête dépasse statement_timeout : la table a grossi ou un index manque, la requête est devenue trop lente.
- Explication : La requête a été annulée car elle dépasse le temps imparti (statement_timeout). Cela peut être dû à une table qui s'est agrandie ou à un manque d'index, rendant la requête trop lente. Vous pouvez optimiser la requête en ajoutant des index sur les filtres et en utilisant EXPLAIN ANALYZE, ou découper la requête pour éviter de dépasser le timeout.

### oom-killer-137
- Cause : Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué (OOM killer, code 137).
- Explication : Le processus a été tué par le noyau en raison d'une mémoire insuffisante (OOM killer). Vous pouvez réduire la consommation de mémoire en traitant les données par lots ou augmenter la limite de mémoire du conteneur ou de la machine.

### disk-full-enospc
- Cause : Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute de rétention.
- Explication : Le volume de destination est plein en raison de l'accumulation de fichiers (sauvegardes, logs). Il faut libérer de la place en purifiant les anciennes sauvegardes et logs et en configurant une rétention pour le job. Vérifiez le volume avec `df -h` et supprimez les fichiers inutiles.

### fork-cannot-allocate
- Cause : Le système refuse de créer de nouveaux processus : mémoire libre épuisée ou limite de processus (ulimit -u, pids du cgroup) atteinte, souvent par trop de tâches en parallèle.
- Explication : Le système refuse de créer de nouveaux processus en raison d'une mémoire insuffisante ou d'un nombre maximal de processus atteint. Vous devez réduire le nombre de tâches lancées en parallèle ou augmenter la limite de processus et la mémoire disponible. Vérifiez la mémoire libre avec `free -m` et la limite de processus avec `ulimit -u`.

### inode-exhaustion
- Cause : Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l'espace disque.
- Explication : Le système de fichiers manque d'inodes car il y a trop de petits fichiers. Vous devez purger ou archiver les dossiers contenant de nombreux petits fichiers pour libérer des inodes.

### stripe-rate-limit-429
- Cause : Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est atteinte.
- Explication : Trop de requêtes ont été envoyées à l'API dans la fenêtre autorisée, ce qui a dépassé sa limite de débit. Il faut respecter le délai indiqué dans Retry-After en utilisant un étalement exponentiel des appels et en vérifiant que seul un job utilise la clé API à la fois.

### api-key-revoked-401
- Cause : L'API refuse l'identifiant du job : clé ou jeton révoqué, expiré ou remplacé (rotation des secrets) sans mise à jour côté job.
- Explication : Le job a reçu une erreur 401 car l'identifiant utilisé pour l'API est révoqué, expiré ou remplacé. Il faut générer la nouvelle clé et mettre à jour le secret utilisé par le job. Vérifiez si une rotation de secrets récente s'est produite et testez la nouvelle clé avec un appel curl.

### vendor-maintenance-503
- Cause : Le service appelé répond 503 : maintenance ou surcharge chez le fournisseur, ou accès refusé aux clients non connectés ou non navigateurs (page réservée, pare-feu applicatif).
- Explication : Le service que nous appelons répond 503, ce qui signifie qu'il est en maintenance ou surchargé. Il peut aussi s'agir d'un accès refusé pour les clients non connectés ou non navigateurs. Réessayez après la fenêtre indiquée (Retry-After) avec un délai exponentiel.

### geocoding-quota-exceeded
- Cause : Le quota alloué par le fournisseur pour la période (jour, minute) est épuisé : le job consomme plus que prévu, ou d'autres usages partagent la même clé.
- Explication : Le quota alloué par le fournisseur pour la période (jour, minute) est épuisé. Cela peut être dû au job consommant plus que prévu ou à d'autres usages partageant la même clé. Il faut attendre la remise à zéro du quota ou l'augmenter, et répartir ou mettre en cache les appels.

### pub-pg-dump-version-mismatch-cron
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le cron utilise une ancienne version de pg_dump qui ne correspond pas à la version du serveur PostgreSQL. Vous devez utiliser un pg_dump à jour ou spécifier le chemin complet vers le bon binaire.

### pub-gitlab-backup-pg-dump-mismatch
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le binaire pg_dump utilisé par le cron est plus ancien que la version du serveur PostgreSQL, ce qui a causé un conflit de versions. Pour résoudre cela, utilisez une version de pg_dump correspondant à celle du serveur ou appelez directement le bon binaire en chemin absolu.

### pub-certbot-timeout-aaaa-old-provider
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le problème est que Let's Encrypt ne peut pas joindre le serveur sur le port 80. Cela pourrait être dû à un pare-feu, une redirection de port, ou des enregistrements DNS incorrects. Il faut donc ouvrir le port 80 depuis Internet et vérifier les enregistrements A/AAAA.

### pub-certbot-timeout-firewall-restarted
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le problème est que Let's Encrypt ne peut pas joindre le serveur sur le port 80. Cela pourrait être dû à un pare-feu, une redirection de port, ou des enregistrements DNS incorrects. Il faut donc ouvrir le port 80 depuis Internet et vérifier les enregistrements A/AAAA.

### pub-mysqldump-lock-tables-privilege
- Cause : Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump.
- Explication : Le compte de sauvegarde n'a pas les privilèges nécessaires pour utiliser LOCK TABLES. Vous pouvez soit ajouter l'option --single-transaction à la commande mysqldump si vous utilisez des tables InnoDB, soit accorder le droit GRANT LOCK TABLES au compte du cron.

### pub-velero-x509-unknown-authority
- Cause : Le certificat est signé par une autorité (CA interne ou auto-signée) absente du magasin de confiance de la machine du job.
- Explication : Le certificat utilisé par le serveur est signé par une autorité (CA interne ou auto-signée) qui n'est pas reconnue par la machine. Vous devez ajouter cette CA au magasin de confiance de la machine, soit en utilisant update-ca-certificates, soit en passant l'option --cacert à l'outil.

### pub-weaviate-x509-legacy-cn
- Cause : Le certificat ne couvre pas ce nom d'hôte dans ses SAN (Subject Alternative Names) ; le Common Name seul n'est plus accepté.
- Explication : Le serveur ne reconnaît pas le nom d'hôte utilisé pour accéder aux données. Le certificat ne couvre pas ce nom dans ses SAN (Subject Alternative Names). Vous devez régénérer le certificat avec les bons SAN ou appeler l'hôte par un nom qu'il couvre.

### pub-aws-s3-sync-sso-expired
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job a échoué car les identifiants de session (SSO) ont expiré. Vous devez donner au job des identifiants durables, comme un rôle d'instance ou un compte de service, ou rafraîchir régulièrement les identifiants.

### pub-s3-upload-expired-token
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job a échoué car les identifiants cloud temporaires utilisés sont expirés. Vous devez donner au job des identifiants durables ou les rafraîchir avant leur expiration.

### pub-node-heap-oom-backup
- Cause : Le traitement charge plus de données que la limite de tas Node.js par défaut.
- Explication : js. Pour résoudre le problème, vous pouvez traiter les données par lots ou augmenter la taille du tas avec NODE_OPTIONS=--max-old-space-size, sans dépasser la capacité de votre RAM.

### p2-cron-perm-denied-owner
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le job exécuté par le cron a reçu un message 'permission denied'. Cela peut être dû à plusieurs raisons : le fichier ou dossier appartient à un autre utilisateur (comme www-data, root), ou il est créé avec des droits restrictifs. Vous pouvez résoudre ce problème en lançant le job sous l'utilisateur propriétaire via crontab -u <user> ou en ajustant les propriétaires et droits du dossier avec chown / chmod.

### p2-php-mysqli-env-vars
- Cause : Le client se connecte par le socket local parce que l'hôte vaut localhost ou est vide : variables de connexion (DB_HOST…) non définies dans l'environnement du cron, ou socket absent à ce chemin.
- Explication : Le client se connecte par le socket local car l'hôte est défini comme localhost ou est vide. ) ne sont pas définies dans l'environnement du cron, ou le socket n'existe pas à ce chemin. 1 au lieu de localhost pour forcer une connexion TCP.

### p2-rake-path-rvm
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'rake' ne peut pas être trouvée car cron démarre avec un PATH minimal qui ne contient pas /usr/local/bin. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p2-mysqldump-p-space — ⚠ mécanisme perdu
- Cause : Le mot de passe n'est pas transmis : MySQL demande « Enter password: » sans terminal puis se connecte sans mot de passe — option -p suivie d'un espace (-p secret est lu comme un nom de base) ou variable du mot de passe vide sous cron.
- Explication : Le serveur MySQL demande un mot de passe car il n'a pas reçu les informations nécessaires. Cela peut se produire si le mot de passe est omis dans la commande ou si le fichier de configuration n'est pas correctement configuré sous cron. cnf pour stocker les informations d'identification.

### p2-docker-no-space
- Cause : Le disque de Docker est plein : conteneurs arrêtés, images et volumes anonymes s'accumulent à chaque exécution (docker run sans --rm).
- Explication : Le disque est plein car Docker accumule des conteneurs, images et volumes non supprimés. Nettoyez le système Docker avec `docker system prune` et `docker volume prune`. Lors de l'exécution des conteneurs, ajoutez l'option `--rm`.

### p2-curl-60-ca-bundle
- Cause : Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine (CA interne, chaîne incomplète, ou magasin de certificats périmé).
- Explication : Le serveur a reçu un certificat qui ne peut pas être vérifié correctement par la machine en raison d'un magasin de certificats obsolète ou d'une chaîne incomplète de certification. Vous devez mettre à jour le magasin de certificats (update-ca-certificates) ou spécifier la CA manuellement avec --cacert. Il est recommandé de ne pas utiliser -k pour ignorer les erreurs de certificat.

### p2-ffmpeg-display-boot
- Cause : DISPLAY est défini mais le serveur X refuse la connexion : le cookie XAUTHORITY de la session n'est pas lisible sous cron, ou la session graphique n'est pas encore prête (job lancé au démarrage, @reboot).
- Explication : La cause de l'échec est que le cookie XAUTHORITY n'est pas accessible lors du lancement en cron, ou que la session graphique n'est pas prête au démarrage. Xauthority dans votre crontab et attendre l'ouverture de la session graphique pour un job @reboot.

### p2-node-path-global
- Cause : Node ne trouve pas le module dans l'environnement du cron : node_modules absents de ce dossier (cron démarre dans HOME), ou module installé globalement (npm -g) invisible sans NODE_PATH.
- Explication : Le Node ne trouve pas le module 'underscore'. Cela peut être dû à la absence de `node_modules` dans le dossier cron ou au fait que le module soit installé globalement. js`) ou définir `NODE_PATH` vers les modules globaux dans la crontab.

### p2-aws-env-cron
- Cause : Le SDK cloud ne trouve pas d'identifiants : ~/.aws (ou équivalent) est dans le HOME d'un autre utilisateur, ou AWS_PROFILE n'est pas défini dans l'environnement du cron.
- Explication : Le SDK cloud ne trouve pas les identifiants nécessaires car ils sont dans le HOME d'un autre utilisateur ou AWS_PROFILE n'est pas défini. Vous devez donner au job ses propres identifiants, comme un rôle d'instance ou des identifiants configurés explicitement. Vérifiez cela en vous connectant sous l'utilisateur du cron et en exécutant 'aws sts get-caller-identity'.

### p2-selenium-path
- Cause : Le navigateur lancé par le job ne démarre pas sous cron : PATH minimal où chrome et ses dépendances sont introuvables, ou pas d'affichage (mode headless non activé).
- Explication : Le navigateur Chrome ne démarre pas sous cron pour deux raisons possibles : le PATH minimal ne contient pas les chemins nécessaires où Chrome et ses dépendances sont introuvables, ou l'affichage n'est pas activé (mode headless non activé). Pour résoudre ce problème, définissez un PATH complet (/usr/local/bin:/usr/bin:/usr/sbin) en tête de la crontab et lancez Chrome avec les options --headless.

### p3-venv-env-var
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : La variable SOME_ENV_VARIABLE nécessaire au job n'existe pas sous cron car elle est définie dans votre shell et non dans un fichier que cron charge. Pour résoudre ce problème, vous pouvez définir la variable en tête de la crontab ou charger explicitement le fichier d'environnement dans le script.

### p3-node-full-path
- Cause : cron lance la commande avec /bin/sh (dash sur Debian/Ubuntu), qui refuse la syntaxe bash ([[ ]], source, tableaux, ${…/…}).
- Explication : Le cron utilise /bin/sh (dash) qui ne supporte pas certaines syntaxes bash comme [[ ]]. sh ou ajoutez SHELL=/bin/bash au début de votre crontab.

### p3-java-classpath
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe `com/gargoylesoftware/htmlunit/WebClient`. Le classpath du job est incomplet sous cron. Vous devez passer le classpath complet en chemins absolus dans la commande du cron.

### p4-python3-import
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : La cause du problème peut être due au fait que le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron. Il peut s'agir d'un autre interpréteur Python (virtualenv non activé, autre version) ou d'un job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user. py).

### p4-shebang-hidden-chars
- Cause : La première ligne #! n'est pas reconnue : elle contient des caractères invisibles (BOM UTF-8 en tête de fichier ou fin de ligne Windows), le shell la prend pour une commande.
- Explication : La première ligne du script contient des caractères invisibles, soit un BOM UTF-8 au début du fichier ou des retours chariots Windows à la fin de la ligne. Le shell l'interprète comme une commande inexistante. Vous devez réécrire la première ligne ou nettoyer le fichier (utilisez dos2unix ou supprimez le BOM avec sed -i '1s/^﻿//') puis relancez.

### p4-rsync-process-subst-sh
- Cause : La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh, qui ne la comprend pas.
- Explication : La commande utilise des fonctionnalités bash spécifiques qui ne sont pas supportées par sh. sh' ou définissez SHELL=/bin/bash dans votre crontab.

### p4-git-ssh-agent — ⚠ mécanisme perdu
- Cause : Git ne peut pas lire le dépôt distant : sous cron, la clé SSH de votre session n'est pas disponible (pas d'agent, autre HOME), ou la clé n'a pas accès à ce dépôt.
- Explication : Git ne peut pas lire le dépôt distant car la clé SSH n'est pas disponible sous cron. La clé dédiée sans passphrase doit être utilisée et ajoutée au dépôt comme clé de déploiement. Tester l'accès avec ssh -T git@<forge> et vérifier la clé de déploiement.

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

### p4-crontab-backquote
- Cause : crontab refuse le fichier : une ligne a une syntaxe invalide (champ horaire faux, ou backquote / % non échappé), donc aucun job de ce fichier n'est installé.
- Explication : Un fichier crontab contient une ligne avec une syntaxe invalide, probablement une erreur de backquote non échappée. Vous devez corriger cette ligne en remplaçant les backquotes par $(…), échapper le % en \. Réinstallez ensuite le crontab avec crontab -e.

### p4-php-relative-require
- Cause : Le job ouvre un fichier par un chemin relatif : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script, donc le chemin ne pointe plus au bon endroit.
- Explication : Le script tente de charger un fichier dans un répertoire qui n'est pas le bon car le dossier courant est différent sous cron. Utilisez des chemins absolus pour éviter ce problème.

### p4-bundle-path-environment
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p4-cron-no-user-var — ⚠ mécanisme perdu
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : bashrc. Pour résoudre cela, vous devez définir la variable en tête de la crontab ou charger explicitement le script environnemental dans votre tâche cron.

### p5-crontab-percent-expr
- Cause : Le journal de cron montre la commande coupée juste avant un % : dans une crontab, % est un saut de ligne, la suite de la commande n'est jamais exécutée.
- Explication : La commande dans le crontab est interrompue juste avant un %. Cela se produit car % représente un saut de ligne dans les expressions cron. Pour résoudre ce problème, vous pouvez échapper chaque % en utilisant \\.

### p5-python-version-import
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : La cause du problème peut être due au fait que le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron. Il peut s'agir d'un autre interpréteur Python (virtualenv non activé, autre version) ou d'un job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user. py).

### p5-env-node-bashrc
- Cause : L'interpréteur indiqué par le shebang (#!) n'existe pas à ce chemin, ou /usr/bin/env ne le trouve pas dans le PATH minimal du cron.
- Explication : Le script a échoué car l'interpréteur node n'existe pas à ce chemin ou n'est pas dans le PATH minimal du cron. Vous devez mettre le chemin absolu correct de l'interpréteur dans le shebang. Utilisez command -v node pour le trouver.

### p5-unixcat-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande unixcat n'est pas trouvée car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p5-proxy-env-cron
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant ne répond pas dans le délai pour plusieurs raisons possibles : il peut être indisponible, surchargé, bloqué par un pare-feu ou refusé par un proxy configuré. Vérifiez l'état du service et réessayez avec un délai exponentiel.

### p6-java-noclassdef-pom
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe `com/google/api/client/json/JsonFactory` car le classpath du job est incomplet sous cron. Vous devez passer le classpath complet en chemins absolus dans la commande du cron. Vérifiez que les chemins sont corrects et incluent tous les fichiers nécessaires.

### p6-rake-bundle-env
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p6-redis-dump-umask
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : rdb. Ce fichier appartient à un autre utilisateur comme www-data ou root, et peut avoir des droits restrictifs. Vous pouvez soit exécuter le job sous l'utilisateur propriétaire, soit ajuster le propriétaire et les droits du dossier.

### p6-logrotate-create-perms — ⚠ mécanisme perdu
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : log' mais n'a pas les droits nécessaires car il appartient à un autre utilisateur (comme www-data ou root) ou est protégé par des droits restrictifs. log` et ajuster les droits si nécessaire.

### p6-sudo-root-module
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : La panne est due au fait que le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron. Le cron peut utiliser un autre interpréteur Python (virtualenv non activé, autre version) ou être lancé sous un autre utilisateur qui n'a pas vos paquets pip --user. py).

### p6-mysql-2002-disk-full
- Cause : Le serveur MySQL local ne tourne pas (arrêté, ou il n'a pas pu démarrer : disque plein, configuration invalide — voir son journal), ou le client cherche le socket à un autre chemin que celui du serveur.
- Explication : Le serveur MySQL peut ne pas tourner, ou avoir un problème avec son socket. Il faut vérifier si le service est démarré et s'il n'y a pas de disque plein ou de configuration incorrecte. Si ce n'est pas le cas, le client devrait se connecter en utilisant TCP au lieu du socket actuel.


## Rejetées par les garde-fous (cause brute affichée à la place)

### dns-resolution-failure — possibilité perdue ou trop court
- Texte du modèle : La machine ne peut pas se connecter à l'hôte 'api.partner-feeds.com'. Cela peut être du aux raisons suivantes : le résolveur DNS est indisponible, le nom d'hôte est incorrect ou l'enregistrement a été supprimé. Vous devez tester la résolution de l'hôte depuis cette machine et vérifier les paramètres du résolveur DNS.

### csv-encoding-garbage — possibilité perdue ou trop court
- Texte du modèle : Le fichier reçu n'est pas encodé en UTF-8, il pourrait être en UTF-16 ou Latin-1. Il faut le convertir en UTF-8 ou lire avec l'encodage correct. Contactez le fournisseur pour confirmer l'encodage.

### p2-crontab-percent — possibilité perdue ou trop court
- Texte du modèle : La cause est que le symbole % dans la ligne de crontab est interprété comme un saut de ligne, coupant prématurément la commande. Pour résoudre cela, chaque % doit être échappé en \. Alternativement, la commande peut être placée dans un script et appelée par le cron.

### p2-pg-dump-pgpass-root — possibilité perdue ou trop court
- Texte du modèle : PostgreSQL refuse les identifiants du job pour plusieurs raisons possibles : le mot de passe a été changé, le fichier ~/.pgpass manque ou est incorrect, des caractères spéciaux dans le mot de passe sont mal interprétés par le shell, ou une règle pg_hba.conf nécessaire est absente. Il faut fournir le bon mot de passe via le fichier ~/.pgpass (avec chmod 600) de l'utilisateur du cron, ajouter la règle appropriée dans pg_hba.conf et redémarrer PostgreSQL pour appliquer les modifications.

### p2-python-ascii-encode — possibilité perdue ou trop court
- Texte du modèle : Le cron s'exécute avec la locale POSIX/C (ASCII), ce qui cause des erreurs lors du traitement de caractères non ASCII. Pour résoudre cela, vous devez définir LC_ALL=C.UTF-8 ou LANG=fr_FR.UTF-8 en tête de la crontab. Vous pouvez également définir PYTHONIOENCODING=utf-8 pour Python scripts.

### p2-git-ssh-key-cron — possibilité perdue ou trop court
- Texte du modèle : Le serveur SSH refuse la clé car le cron n'utilise pas l'agent SSH ni les clés de votre session. La clé dédiée doit être spécifiée avec ssh -i ou IdentityFile dans ~/.ssh/config. Assurez-vous que la clé a les droits appropriés et qu'elle est présente dans authorized_keys du compte distant.

### p3-smtp-port-blocked — possibilité perdue ou trop court
- Texte du modèle : La connexion réseau vers l'hôte est interrompue, ce qui peut être dû à un problème avec le tunnel VPN, une route manquante ou des restrictions de pare-feu. Vérifiez ces éléments et réessaye.

### p3-crontab-percent-date — possibilité perdue ou trop court
- Texte du modèle : La cause est que le symbole % dans la crontab est interprété comme un saut de ligne, coupant prématurément la commande. Pour résoudre cela, échappez chaque % en \\

### p3-scp-agent — possibilité perdue ou trop court
- Texte du modèle : Le serveur SSH refuse la clé car le job est lancé sous un utilisateur différent et manque de l'autorisation nécessaire. Il faut préciser la clé dédiée pour l'utilisateur du cron et vérifier que la clé publique est bien présente dans authorized_keys sur le serveur.

### p3-activate-path-bashrc — possibilité perdue ou trop court
- Texte du modèle : Le script sous cron ne trouve pas le fichier 'activate'. Cela peut être du au chemin relatif, PATH réduit ou sh qui ne connaît pas source. Pour résoudre ce problème, appeler directement python en spécifiant son chemin absolu: /chemin/venv/bin/python script.py.

### p3-git-push-root-home — possibilité perdue ou trop court
- Texte du modèle : Le serveur SSH refuse la clé car le job est lancé sous un utilisateur différent et manque de l'autorisation nécessaire. Il faut préciser la clé dédiée à utiliser dans le cron et vérifier que la clé publique est bien présente dans authorized_keys du compte distant.

### p4-pgpassword-quotes — possibilité perdue ou trop court
- Texte du modèle : PostgreSQL refuse les identifiants du job pour plusieurs raisons possibles : le mot de passe a été changé, le fichier ~/.pgpass manque ou est incorrect pour l'utilisateur du cron, des caractères spéciaux dans le mot de passe sont mal interprétés par le shell, ou une règle pg_hba.conf nécessaire est absente. Pour résoudre ce problème, assurez-vous que le bon mot de passe est fourni via un fichier ~/.pgpass (avec chmod 600) pour l'utilisateur du cron, ou ajoutez la règle appropriée dans pg_hba.conf et rechargez les paramètres de configuration.

### p5-ruby-shebang-127 — possibilité perdue ou trop court
- Texte du modèle : La commande est introuvable dans le PATH du cron ou son nom est incorrect. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab. Pour vérifier, reproduisez avec l'environnement du cron comme indiqué.

### p5-cronhourly-crontab-syntax — possibilité perdue ou trop court
- Texte du modèle : La commande `bin` n'est pas trouvée car elle n'est pas dans le PATH minimal (/usr/bin:/bin) du cron. La cause peut être que la commande est introuvable ou son nom est incorrect. Pour résoudre ce problème, appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p6-pgdump-crlf — possibilité perdue ou trop court
- Texte du modèle : 

### p6-wget-503-auth — possibilité perdue ou trop court
- Texte du modèle : Le service appelé répond 503 pour plusieurs raisons possibles : maintenance du fournisseur, surcharge du système, ou accès refusé aux clients non connectés. Il faut réessayer après la fenêtre indiquée (Retry-After) avec un délai exponentiel. Vérifiez la page de statut du fournisseur et respectez le délai avant de réessayer.
