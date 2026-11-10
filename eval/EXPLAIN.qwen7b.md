# Rôle IA n°1 — expliquer une panne établie (2026-11-10)

- **cas** : 80
- **fidelite** : 99 % (attente ≥ 95 %)
- **mecanisme_garde** : 87 % sur 75 (attente ≥ 90 %)
- **mots_mediane** : 37 (attente ≤ 60)
- **phrases_max** : 4 (attente ≤ 3)
- **latence_mediane_s** : 14.2 (attente ≤ 8)

## Exemples (à relire)

### pg-connection-refused
- Cause : Le serveur PostgreSQL n'écoute pas à cette adresse : service arrêté ou redémarré, ou listen_addresses / pare-feu qui bloque.
- Explication : Le serveur PostgreSQL n'écoute pas sur l'adresse indiquée, probablement à cause d'un service arrêté ou de restrictions de pare-feu. Vous devez redémarrer le service et vérifier les paramètres listen_addresses.

### pg-too-many-connections
- Cause : Toutes les connexions PostgreSQL sont prises (limite max_connections atteinte), souvent par des connexions oubliées ou un pool mal dimensionné.
- Explication : Toutes les connexions PostgreSQL sont actuellement utilisées, souvent en raison de connexions oubliées. Vous devez libérer ces connexions et utiliser un pooler (PgBouncer) pour gérer les connexions plutôt que d'augmenter max_connections.

### mysql-deadlock
- Cause : Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la base en a annulé une (deadlock).
- Explication : Deux transactions ont essayé de verrouiller les mêmes lignes dans un ordre différent, ce qui a entraîné un deadlock. La base de données a annulé une des transactions. Pour résoudre le problème, relancez la transaction en prenant toujours les verrous dans le même ordre et en raccourcissant les transactions.

### pg-disk-full-wal
- Cause : Le volume de PostgreSQL est plein à cause de pg_wal : un slot de réplication inactif ou un archivage en échec empêche le recyclage des WAL.
- Explication : Le volume de PostgreSQL est plein en raison du réplica inactif ou d'un archivage en échec qui empêche le recyclage des WAL. Vous devez supprimer le slot de réplication abandonné (ou réparer l'archivage) puis libérer ou agrandir le volume.

### dns-resolution-failure
- Cause : Le nom d'hôte ne se résout pas : résolveur DNS injoignable, nom erroné ou enregistrement supprimé.
- Explication : Le nom d'hôte api.partner-feeds.com ne peut pas être résolu. Vérifiez la configuration du résolveur DNS ou le nom d'hôte. Testez la résolution depuis cette machine avec getent hosts api.partner-feeds.com.

### tls-cert-expired
- Cause : Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu lieu.
- Explication : Le certificat TLS du serveur appelé a expiré, ce qui a provoqué l'erreur. Vous devez renouveler le certificat ou prévenir le tiers concerné. Ne pas désactiver la vérification de la certification.

### econnreset-mid-transfer
- Cause : L'autre côté a coupé la connexion en cours de route : redémarrage ou timeout côté serveur, équipement réseau qui ferme les connexions longues.
- Explication : La connexion a été coupée par l'autre côté en raison d'un redémarrage du serveur ou d'un timeout. Pour résoudre le problème, relancez le transfert avec la reprise activée et faites-le de manière espacée. Vérifiez également les logs du serveur distant à la même heure et assurez-vous que la reprise est activée pour les transferts longs.

### route-unreachable-vpn
- Cause : Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sortant bloqué.
- Explication : Le système ne peut pas atteindre l'hôte car le tunnel VPN ou le lien réseau est indisponible, une route manquante existe, ou le trafic sortant est bloqué. Vérifiez le tunnel VPN et la route vers l'hôte, puis examinez les règles du pare-feu sortant. Relancez ensuite le processus.

### watchdog-sigkill
- Cause : Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdog) et a été tué avant la fin.
- Explication : Le job a été interrompu car il a dépassé la durée maximale autorisée. Pour résoudre ce problème, vous pouvez réduire la durée du job ou augmenter la limite de temps si cela est nécessaire. Assurez-vous également que le job peut reprendre correctement en cas de coupure.

### http-client-timeout
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant ne répond pas à temps, ce qui cause l'opération d'échouer. Vous devez vérifier si le service est disponible en utilisant un outil comme nc pour tester la connexion. Si le service est indisponible ou surchargé, réessayez plus tard avec un délai exponentiel.

### query-statement-timeout
- Cause : La requête dépasse statement_timeout : la table a grossi ou un index manque, la requête est devenue trop lente.
- Explication : La requête a été annulée car elle prenait trop de temps à s'exécuter. La table a peut-être grossi ou un index manque, rendant la requête plus lente. Vous devriez optimiser la requête en ajoutant un index sur le filtre utilisé ou en découplant la requête, ou vérifier si un index manquant peut être ajouté.

### oom-killer-137
- Cause : Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué (OOM killer, code 137).
- Explication : Le processus Python3 a été tué par le noyau en raison d'une mémoire insuffisante. Vous devez réduire la charge de travail en traitant les données par lots ou augmenter la limite de mémoire du conteneur ou de la machine.

### disk-full-enospc
- Cause : Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute de rétention.
- Explication : Le volume de destination est plein en raison de l'accumulation de fichiers (sauvegardes, logs). Il faut libérer de la place en purifiant les anciennes sauvegardes et logs et en configurant une rétention pour le job. Vérifiez le volume avec `df -h` et supprimez les fichiers inutiles avant de reconfigurer la rétention.

### fork-cannot-allocate
- Cause : Le système refuse de créer de nouveaux processus : mémoire libre épuisée ou limite de processus (ulimit -u, pids du cgroup) atteinte, souvent par trop de tâches en parallèle.
- Explication : Le système ne peut pas créer de nouveaux processus en raison d'une mémoire insuffisante ou d'un nombre maximal de processus atteint. Vous devez réduire le nombre de tâches lancées en même temps ou augmenter la limite de processus et la mémoire disponible.

### inode-exhaustion
- Cause : Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l'espace disque.
- Explication : Le système de fichiers manque d'inodes car il y a trop de petits fichiers. Vous devez purger ou archiver les dossiers contenant de nombreux petits fichiers pour libérer des inodes.

### stripe-rate-limit-429
- Cause : Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est atteinte.
- Explication : Trop de requêtes ont été envoyées à l'API dans la fenêtre autorisée, ce qui a dépassé sa limite de débit. Il faut respecter le délai indiqué dans Retry-After en augmentant exponentiellement ce délai si nécessaire et étaler les appels pour éviter d'en envoyer trop rapidement.

### api-key-revoked-401
- Cause : L'API refuse l'identifiant du job : clé ou jeton révoqué, expiré ou remplacé (rotation des secrets) sans mise à jour côté job.
- Explication : L'API refuse l'identifiant du job car la clé ou le jeton est révoqué, expiré ou remplacé. Vous devez générer une nouvelle clé et mettre à jour celle utilisée par le job.

### vendor-maintenance-503
- Cause : Le service appelé répond 503 : maintenance ou surcharge chez le fournisseur, ou accès refusé aux clients non connectés ou non navigateurs (page réservée, pare-feu applicatif).
- Explication : Le service que vous essayez de joindre est en maintenance ou surcharge. Attendez la fenêtre indiquée (Retry-After) avant de réessayer. Réessayez progressivement pour éviter d'overload le service.

### geocoding-quota-exceeded
- Cause : Le quota alloué par le fournisseur pour la période (jour, minute) est épuisé : le job consomme plus que prévu, ou d'autres usages partagent la même clé.
- Explication : Le quota de ressources du fournisseur est épuisé. Attendez la remise à zéro du quota ou augmentez-le. Répartissez ou cachez les appels pour éviter d'atteindre ce quota.

### csv-encoding-garbage
- Cause : Le fichier reçu n'est pas encodé en UTF-8 (UTF-16, Latin-1…) : le fournisseur a changé d'encodage ou d'outil d'export.
- Explication : Le fichier reçu n'est pas en encodage UTF-8, ce qui a provoqué une erreur. Vous devez convertir le fichier en UTF-8 ou lire avec l'encodage correct et informer le fournisseur de la requête.

### pub-pg-dump-version-mismatch-cron
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le cron utilise une ancienne version de pg_dump qui ne correspond pas à la version du serveur PostgreSQL. Vous devez utiliser un pg_dump à jour ou spécifier le chemin complet vers le bon binaire.

### pub-gitlab-backup-pg-dump-mismatch
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le binaire pg_dump utilisé par le cron est plus ancien que la version du serveur PostgreSQL, ce qui a causé un conflit de versions. Pour résoudre cela, utilisez une version de pg_dump correspondant à celle du serveur ou appelez directement le bon binaire en chemin absolu.

### pub-certbot-timeout-aaaa-old-provider
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le problème est que Let's Encrypt ne peut pas joindre votre serveur sur le port 80. Cela peut être dû à un pare-feu, une redirection de port ou à des enregistrements DNS incorrects. Vous devez ouvrir le port 80 depuis Internet et vérifier les enregistrements A/AAAA pour qu'ils pointent vers votre serveur. Après avoir fait ces modifications, exécutez certbot renew --dry-run pour tester.

### pub-certbot-timeout-firewall-restarted
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le problème est que Let's Encrypt ne peut pas joindre votre serveur sur le port 80. Cela peut être dû à un pare-feu, une redirection de port ou à des enregistrements DNS incorrects. Vous devez ouvrir le port 80 depuis Internet et vérifier les enregistrements A/AAAA pour qu'ils pointent vers votre serveur. Après avoir fait ces modifications, exécutez certbot renew --dry-run pour tester.

### pub-mysqldump-lock-tables-privilege
- Cause : Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump.
- Explication : Le compte de sauvegarde n'a pas les droits nécessaires pour verrouiller les tables. Vous devez soit ajouter l'option --single-transaction à la commande mysqldump si vous utilisez des tables InnoDB, soit accorder le privilège LOCK TABLES au compte du cron.

### pub-velero-x509-unknown-authority
- Cause : Le certificat est signé par une autorité (CA interne ou auto-signée) absente du magasin de confiance de la machine du job.
- Explication : Le certificat utilisé par le serveur est signé par une autorité (CA) qui n'est pas reconnue par la machine. Pour résoudre ce problème, ajoutez cette CA au magasin de confiance de la machine.

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
- Explication : Le programme a essayé de charger trop de données dans la mémoire, ce qui dépasse la limite par défaut de Node.js. Pour résoudre le problème, vous pouvez traiter les données par lots ou augmenter la taille du tas avec NODE_OPTIONS=--max-old-space-size, sans dépasser la capacité de votre RAM.

### p2-cron-perm-denied-owner
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le job cron a échoué car il n'a pas les droits nécessaires sur un fichier ou dossier. Ce problème peut être résolu en exécutant le job sous l'utilisateur propriétaire ou en ajustant les droits du dossier.

### p2-php-mysqli-env-vars
- Cause : Le client se connecte par le socket local parce que l'hôte vaut localhost ou est vide : variables de connexion (DB_HOST…) non définies dans l'environnement du cron, ou socket absent à ce chemin.
- Explication : Le client se connecte par le socket local car l'hôte est défini comme localhost ou est vide. Cela signifie que les variables de connexion (DB_HOST...) n'ont pas été définies dans l'environnement du cron, ou que le socket n'existe pas à ce chemin. Pour résoudre le problème, vous devez définir ces variables de connexion dans la crontab ou le script, ou utiliser 127.0.0.1 au lieu de localhost pour forcer une connexion TCP.

### p2-rake-path-rvm — ❌ inventé : /usr/local/bin.
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'rake' ne peut pas être trouvée car cron démarre avec un PATH minimal qui ne contient pas /usr/local/bin. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p2-crontab-percent
- Cause : Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé (souvent dans date +%Y%m%d), d'où le guillemet ou la parenthèse jamais refermés.
- Explication : Un % non échappé dans une ligne de crontab est interprété comme un saut de ligne, ce qui coupe prématurément la commande. Pour corriger cela, échappez chaque % en \\

### p2-mysqldump-p-space — ⚠ mécanisme perdu
- Cause : Le mot de passe n'est pas transmis : MySQL demande « Enter password: » sans terminal puis se connecte sans mot de passe — option -p suivie d'un espace (-p secret est lu comme un nom de base) ou variable du mot de passe vide sous cron.
- Explication : Le serveur MySQL demande un mot de passe car il n'a pas reçu le bon paramètre. Vous devez ajouter le mot de passe après l'option -p dans la commande ou utiliser un fichier de configuration sécurisé pour stocker les informations d'identification.

### p2-pg-dump-pgpass-root
- Cause : PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'utilisateur du cron, mot de passe dont les caractères spéciaux ($, !, guillemets) sont déformés par le shell, ou règle pg_hba.conf manquante.
- Explication : PostgreSQL refuse les identifiants du job en raison d'un mot de passe changé ou d'une règle manquante dans le fichier pg_hba.conf. Vous devez fournir le bon mot de passe via le fichier ~/.pgpass (avec chmod 600) pour l'utilisateur du cron, ou ajouter une règle appropriée dans le fichier pg_hba.conf.

### p2-docker-no-space
- Cause : Le disque de Docker est plein : conteneurs arrêtés, images et volumes anonymes s'accumulent à chaque exécution (docker run sans --rm).
- Explication : Le disque est plein car Docker accumule des conteneurs, images et volumes sans les supprimer automatiquement. Pour résoudre le problème, nettoyez le système Docker avec `docker system prune` et `docker volume prune`, puis lancez vos conteneurs en ajoutant l'option `--rm`. Vérifiez d'abord ce qui occupe de la place avec `docker system df`.

### p2-curl-60-ca-bundle
- Cause : Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine (CA interne, chaîne incomplète, ou magasin de certificats périmé).
- Explication : Le serveur a reçu un certificat qui ne peut pas être vérifié correctement par la machine. Pour résoudre le problème, mettez à jour le magasin de certificats ou spécifiez la CA manuellement avec --cacert. Relancez ensuite le job.

### p2-ffmpeg-display-boot
- Cause : DISPLAY est défini mais le serveur X refuse la connexion : le cookie XAUTHORITY de la session n'est pas lisible sous cron, ou la session graphique n'est pas encore prête (job lancé au démarrage, @reboot).
- Explication : Le serveur X refuse la connexion car le cookie XAUTHORITY n'est pas lisible sous cron. Pour résoudre ce problème, définissez XAUTHORITY=/home/<utilisateur>/.Xauthority dans votre crontab et attendez que la session graphique soit prête si vous utilisez @reboot.

### p2-python-ascii-encode
- Cause : cron s'exécute avec la locale POSIX/C (ASCII) : le programme ne peut pas écrire ou lire de caractères non ASCII.
- Explication : Le cron s'exécute avec une locale ASCII, ce qui cause des erreurs lors du traitement de caractères non ASCII. Pour résoudre le problème, ajoutez LC_ALL=C.UTF-8 en tête de la crontab ou utilisez PYTHONIOENCODING=utf-8 pour Python.

### p2-node-path-global — ⚠ mécanisme perdu
- Cause : Node ne trouve pas le module dans l'environnement du cron : node_modules absents de ce dossier (cron démarre dans HOME), ou module installé globalement (npm -g) invisible sans NODE_PATH.
- Explication : Le cron ne trouve pas le module underscore car les node_modules sont absents dans le dossier de lancement. Pour résoudre ce problème, changez votre commande crontab pour se déplacer dans le dossier du projet avant d'exécuter node, par exemple : cd /chemin/projet && node script.js.

### p2-aws-env-cron
- Cause : Le SDK cloud ne trouve pas d'identifiants : ~/.aws (ou équivalent) est dans le HOME d'un autre utilisateur, ou AWS_PROFILE n'est pas défini dans l'environnement du cron.
- Explication : Le SDK cloud ne trouve pas les identifiants nécessaires car ils sont dans le HOME d'un autre utilisateur ou AWS_PROFILE n'est pas défini. Donnez au job ses propres identifiants, par exemple en utilisant un rôle d'instance ou en définissant explicitement AWS_PROFILE.

### p2-selenium-path
- Cause : Le navigateur lancé par le job ne démarre pas sous cron : PATH minimal où chrome et ses dépendances sont introuvables, ou pas d'affichage (mode headless non activé).
- Explication : Le navigateur Chrome ne démarre pas car le PATH minimal n'inclut pas les chemins nécessaires et le mode headless n'est pas activé. Pour résoudre ce problème, ajoutez un PATH complet en tête de la crontab et lancez Chrome avec l'option --headless.

### p2-git-ssh-key-cron — ⚠ mécanisme perdu
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car le cron ne peut pas accéder à la clé de votre session et utilise celle de root. Vous devez préciser explicitement la clé à utiliser avec l'option -i ou IdentityFile dans le cron. Assurez-vous que la clé a les droits appropriés (chmod 600) et qu'elle est bien listée dans authorized_keys du compte distant.

### p3-smtp-port-blocked
- Cause : Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sortant bloqué.
- Explication : Le réseau vers l'hôte est indisponible car le tunnel VPN ou le lien réseau a peut-être échoué, une route manquante existe, ou le trafic sortant est bloqué. Vérifiez le tunnel VPN et la route, puis examinez les règles du pare-feu sortant. Relancez ensuite le service.

### p3-venv-env-var
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : La variable SOME_ENV_VARIABLE nécessaire au job n'existe pas sous cron car elle est définie dans votre shell mais cron ne charge pas ce fichier. Vous devez définir cette variable en tête de la crontab ou charger explicitement le fichier d'environnement dans le script.

### p3-crontab-percent-date
- Cause : Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé (souvent dans date +%Y%m%d), d'où le guillemet ou la parenthèse jamais refermés.
- Explication : Un % non échappé dans une crontab signifie un saut de ligne, ce qui a coupé votre commande. Pour corriger cela, échappez chaque % en \\

### p3-node-full-path
- Cause : cron lance la commande avec /bin/sh (dash sur Debian/Ubuntu), qui refuse la syntaxe bash ([[ ]], source, tableaux, ${…/…}).
- Explication : Le cron utilise /bin/sh (dash) qui ne supporte pas certaines syntaxes bash. Pour résoudre le problème, exécutez le script avec bash explicitement en utilisant `bash script.sh` ou définissez SHELL=/bin/bash dans la crontab avec un shebang #!/bin/bash au début du script.

### p3-java-classpath
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe WebClient car le classpath est incomplet dans votre job cron. Vous devez spécifier les chemins complets des JARs utilisés, en utilisant des chemins absolus et en incluant tous les fichiers nécessaires.

### p3-scp-agent — ⚠ mécanisme perdu
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car il ne trouve pas la bonne clé pour l'utilisateur du cron. Vous devez préciser explicitement la clé à utiliser avec l'option -i ou IdentityFile dans le fichier crontab de l'utilisateur root. Assurez-vous également que la clé privée a les droits appropriés et est bien listée dans authorized_keys sur le serveur distant.

### p3-activate-path-bashrc
- Cause : Le script active un virtualenv par un chemin introuvable sous cron (chemin relatif, PATH réduit, ou sh qui ne connaît pas source) : le bon environnement Python n'est jamais chargé.
- Explication : Le script sous cron ne trouve pas le fichier 'activate' car il utilise un chemin relatif. Pour résoudre ce problème, appelez directement Python depuis le chemin absolu du virtualenv : /chemin/venv/bin/python script.py.

### p3-git-push-root-home
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car il ne trouve pas la bonne clé pour l'utilisateur du cron. Vous devez préciser explicitement la clé à utiliser avec l'option -i ou IdentityFile dans le cron. Ensuite, assurez-vous que cette clé est bien présente et correctement configurée sur le compte distant.

### p4-python3-import — ⚠ mécanisme perdu
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le module pyautogui n'est pas installé dans le virtualenv utilisé par le cron. Vous devez exécuter le script en utilisant le Python du virtualenv en spécifiant son chemin absolu.

### p4-shebang-hidden-chars
- Cause : La première ligne #! n'est pas reconnue : elle contient des caractères invisibles (BOM UTF-8 en tête de fichier ou fin de ligne Windows), le shell la prend pour une commande.
- Explication : La première ligne du script contient des caractères invisibles qui font que le shell la prend pour une commande. Pour résoudre ce problème, vous devez soit réécrire la première ligne, soit nettoyer le fichier en supprimant ces caractères (utilisez dos2unix ou sed) et relancer le script.

### p4-rsync-process-subst-sh
- Cause : La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh, qui ne la comprend pas.
- Explication : La commande utilise des fonctionnalités bash spécifiques qui ne sont pas supportées par sh. Pour résoudre le problème, exécutez le script avec bash en utilisant la commande 'bash script.sh' ou définissez SHELL=/bin/bash dans votre crontab.

### p4-git-ssh-agent — ⚠ mécanisme perdu
- Cause : Git ne peut pas lire le dépôt distant : sous cron, la clé SSH de votre session n'est pas disponible (pas d'agent, autre HOME), ou la clé n'a pas accès à ce dépôt.
- Explication : Git ne peut pas lire le dépôt distant car la clé SSH n'est pas disponible lors de l'exécution du cron. Vous devez donner au job une clé dédiée sans passphrase et ajouter cette clé comme clé de déploiement dans le dépôt.

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
- Explication : La crontab contient une commande avec un % non échappé, ce qui fait que la commande est interrompue prématurément. Pour résoudre le problème, échappez chaque % en \\

### p4-crontab-backquote
- Cause : crontab refuse le fichier : une ligne a une syntaxe invalide (champ horaire faux, ou backquote / % non échappé), donc aucun job de ce fichier n'est installé.
- Explication : Une ligne du crontab contient une syntaxe invalide due à une backquote non échappée. Vous devez remplacer cette backquote par $(…), échapper le pourcentage en \. Réinstallez ensuite le crontab avec crontab -e. Vérifiez la configuration avec crontab -l et testez l'expression horaire sur un validateur cron.

### p4-php-relative-require
- Cause : Le job ouvre un fichier par un chemin relatif : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script, donc le chemin ne pointe plus au bon endroit.
- Explication : Le script tente de charger un fichier dans un répertoire qui n'est pas le bon car le chemin relatif ne fonctionne pas sous cron. Utilisez des chemins absolus pour résoudre ce problème.

### p4-pgpassword-quotes — ⚠ mécanisme perdu
- Cause : PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'utilisateur du cron, mot de passe dont les caractères spéciaux ($, !, guillemets) sont déformés par le shell, ou règle pg_hba.conf manquante.
- Explication : Le job utilise un mot de passe incorrect ou manque le fichier ~/.pgpass. Vérifiez que le fichier ~/.pgpass existe et est en chmod 600 pour l'utilisateur du cron, puis fournissez le bon mot de passe.

### p4-bundle-path-environment
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p4-cron-no-user-var
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : La variable d'environnement USER n'est pas définie dans cron car ce dernier ne charge pas les scripts shell comme .bashrc. Pour résoudre cela, vous devez définir la variable en tête de la crontab ou charger explicitement le script environnemental dans votre tâche cron.

### p5-ruby-shebang-127
- Cause : Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) ou son nom est faux.
- Explication : La tâche cron ne peut pas trouver la commande car son chemin n'est pas inclus dans PATH. Vous devez spécifier le chemin complet de l'outil ou définir PATH en tête de la crontab.

### p5-crontab-percent-expr
- Cause : Le journal de cron montre la commande coupée juste avant un % : dans une crontab, % est un saut de ligne, la suite de la commande n'est jamais exécutée.
- Explication : La commande dans le crontab est interrompue juste avant un %. Cela se produit car % représente un saut de ligne dans les expressions cron. Pour résoudre ce problème, vous pouvez échapper chaque % en utilisant \\. Alternativement, vous pouvez déplacer la commande vers un script.

### p5-cronhourly-crontab-syntax
- Cause : Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) ou son nom est faux.
- Explication : La commande `bin` n'est pas trouvée dans le PATH minimal du cron. Vous devez utiliser un chemin absolu pour l'exécution de la commande ou définir correctement le PATH en tête de la crontab.

### p5-python-version-import
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le module 'stem' n'est pas installé pour l'utilisateur ou l'interpréteur utilisé par le cron. Vous devez exécuter le script en utilisant le Python du virtualenv en spécifiant son chemin absolu.

### p5-env-node-bashrc
- Cause : L'interpréteur indiqué par le shebang (#!) n'existe pas à ce chemin, ou /usr/bin/env ne le trouve pas dans le PATH minimal du cron.
- Explication : Le fichier script utilise un shebang avec node, mais /usr/bin/env ne trouve pas node dans le PATH minimal du cron. Mettez le chemin absolu correct de l'interpréteur dans le shebang.

### p5-unixcat-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande unixcat n'est pas trouvée car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p5-proxy-env-cron — ⚠ mécanisme perdu
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant ne répond pas à temps, ce qui cause le délai d'échec. Vous devez vérifier l'état du service et réessayer avec un délai exponentiel.

### p6-java-noclassdef-pom
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe `com/google/api/client/json/JsonFactory` car le classpath du job est incomplet sous cron. Vous devez spécifier les chemins complets des jars en utilisant des chemins absolus dans la commande du cron.

### p6-rake-bundle-env
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : La commande 'bundle' n'est pas trouvable car cron démarre avec un PATH minimal. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

### p6-pgdump-crlf
- Cause : Les options de la commande se retrouvent seules sur une ligne : la continuation « \ » est cassée (fins de ligne Windows \r, ou espace après le \), donc chaque ligne est lancée comme une commande à part.
- Explication : Les options de la commande sont mal formées car la continuation avec \ est cassée. Vous devez convertir le script et vérifier que les \ ne contiennent pas d'espace en fin de ligne. Relancez ensuite la commande.

### p6-redis-dump-umask
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le job cron n'a pas les droits nécessaires pour accéder au fichier dump.rdb. Ce fichier appartient à www-data et a des permissions restrictives. Vous devez exécuter le job sous l'utilisateur www-data ou ajuster les droits du fichier.

### p6-wget-503-auth
- Cause : Le service appelé répond 503 : maintenance ou surcharge chez le fournisseur, ou accès refusé aux clients non connectés ou non navigateurs (page réservée, pare-feu applicatif).
- Explication : Le service est en maintenance ou surcharge chez le fournisseur. Attends la fenêtre indiquée (Retry-After) avant de réessayer. Consulte la page de statut du fournisseur pour plus d'informations.

### p6-logrotate-create-perms
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le cron ne peut pas accéder au fichier 'celery.log' car il n'a pas les droits nécessaires. Le propriétaire du fichier est 'www-data' ou 'root'.

### p6-sudo-root-module — ⚠ mécanisme perdu
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le module BeautifulSoup4 (bs4) n'est pas installé dans l'environnement Python utilisé par le cron. Vous devez exécuter le script en utilisant le Python de votre virtualenv en spécifiant son chemin absolu.

### p6-mysql-2002-disk-full — ⚠ mécanisme perdu
- Cause : Le serveur MySQL local ne tourne pas (arrêté, ou il n'a pas pu démarrer : disque plein, configuration invalide — voir son journal), ou le client cherche le socket à un autre chemin que celui du serveur.
- Explication : Le serveur MySQL n'est pas démarré ou le client essaie de se connecter à un chemin incorrect du socket. Vérifiez si le service MySQL est en cours d'exécution et démarrez-le s'il ne l'est pas, ou utilisez -h 127.0.0.1 pour la connexion.
