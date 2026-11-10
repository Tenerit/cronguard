# Rôle IA n°1 — expliquer une panne établie (2026-11-10)

- **cas** : 80
- **fidelite** : 98 % (attente ≥ 95 %)
- **mecanisme_garde** : 76 % sur 75 (attente ≥ 90 %)
- **mots_mediane** : 41 (attente ≤ 60)
- **phrases_max** : 4 (attente ≤ 3)
- **latence_mediane_s** : 7.1 (attente ≤ 8)

## Exemples (à relire)

### pg-connection-refused — ⚠ mécanisme perdu
- Cause : Le serveur PostgreSQL n'écoute pas à cette adresse : service arrêté ou redémarré, ou listen_addresses / pare-feu qui bloque.
- Explication : Le serveur PostgreSQL n'est pas en écoute sur l'adresse spécifiée. Vérifiez que le service est redémarré et relancez le job pour essayer de relier à nouveau.

### pg-too-many-connections
- Cause : Toutes les connexions PostgreSQL sont prises (limite max_connections atteinte), souvent par des connexions oubliées ou un pool mal dimensionné.
- Explication : Toutes les connexions PostgreSQL sont prises car la limite max_connections est atteinte. Pour résoudre le problème, il faut libérer les connexions inactives et utiliser un pooler (PgBouncer) plutôt que d'augmenter la limite de connexions.

### mysql-deadlock
- Cause : Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la base en a annulé une (deadlock).
- Explication : Deux transactions ont bloqué l'autre en essayant de modifier la même ligne. Pour résoudre le problème, relancez la transaction et assurez-vous d'utiliser les mêmes verrous dans le même ordre pour éviter un nouveau deadlock.

### pg-disk-full-wal
- Cause : Le volume de PostgreSQL est plein à cause de pg_wal : un slot de réplication inactif ou un archivage en échec empêche le recyclage des WAL.
- Explication : Le volume de PostgreSQL est plein et empêche le recyclage des WAL. Il faut supprimer le slot de réplication abandonné ou réparer l'archivage pour libérer du espace, puis agrandir ou libérer le volume pour résoudre le problème.

### dns-resolution-failure
- Cause : Le nom d'hôte ne se résout pas : résolveur DNS injoignable, nom erroné ou enregistrement supprimé.
- Explication : Le nom d'hôte 'api.partner-feeds.com' ne peut pas être résolu. Vérifiez le nom et assurez-vous qu'il est correctement enregistré auprès de votre fournisseur. Essayez ensuite la résolution depuis votre machine du job avec 'getent hosts api.partner-feeds.com' ou 'dig api.partner-feeds.com'.

### tls-cert-expired
- Cause : Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu lieu.
- Explication : Le certificat TLS du serveur appelé a expiré et n'a pas été renouvelé. Il faut donc renouveler le certificat ou prévenir le tiers qui utilise ce certificat pour éviter de générer des erreurs.

### econnreset-mid-transfer
- Cause : L'autre côté a coupé la connexion en cours de route : redémarrage ou timeout côté serveur, équipement réseau qui ferme les connexions longues.
- Explication : La connexion a été coupée par l'autre côté sans notre consentement. Pour continuer à travailler sur le transfert, il faut relancer la connexion avec reprise et essayer plusieurs fois pour éviter les erreurs de connexion.

### route-unreachable-vpn — ⚠ mécanisme perdu
- Cause : Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sortant bloqué.
- Explication : Le problème est causé par un blocage de trafic sortant sur le port 636, qui est utilisé pour se connecter au serveur. Vérifiez le pare-feu sortant et assurez-vous que ce port n'est pas bloqué par votre fournisseur.

### watchdog-sigkill
- Cause : Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdog) et a été tué avant la fin.
- Explication : Le job a dépassé la durée maximale autorisée et a été arrêté. Il faut réduire la durée du traitement ou ajuster la limite pour éviter cela à l'avenir.

### http-client-timeout
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant est indisponible ou surchargé, il faut vérifier son état et réessayer avec un délai plus long pour essayer de le contacter.

### query-statement-timeout — ⚠ mécanisme perdu
- Cause : La requête dépasse statement_timeout : la table a grossi ou un index manque, la requête est devenue trop lente.
- Explication : La requête a dépassé la limite de temps autorisé (statement_timeout) car elle est trop lente. Il faut optimiser la requête ou la découper pour éviter ce problème.

### oom-killer-137
- Cause : Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué (OOM killer, code 137).
- Explication : Le système a dépassé la mémoire disponible et a tué le processus python3 pour éviter une panne. Pour résoudre ce problème, il faut réduire le pic de mémoire ou augmenter la limite mémoire du conteneur ou de la machine.

### disk-full-enospc
- Cause : Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute de rétention.
- Explication : Le volume de destination est plein, ce qui empêche l'enregistrement de nouveaux fichiers. Il faut libérer de la place en supprimant les anciennes sauvegardes et logs et en ajoutant une rétention au job pour éviter que cela se reproduise.

### fork-cannot-allocate
- Cause : Le système refuse de créer de nouveaux processus : mémoire libre épuisée ou limite de processus (ulimit -u, pids du cgroup) atteinte, souvent par trop de tâches en parallèle.
- Explication : Le système refuse de créer de nouveaux processus car il n'y a plus de mémoire libre ou la limite de processus est atteinte. Pour résoudre le problème, vous pouvez réduire le nombre de processus lancés en parallèle ou relever la limite de processus et la mémoire disponible.

### inode-exhaustion — ⚠ mécanisme perdu
- Cause : Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l'espace disque.
- Explication : Le système de fichiers est plein et ne peut plus gérer les petits fichiers. Il faut purger ou regrouper ces fichiers pour libérer de l'espace disque.

### stripe-rate-limit-429
- Cause : Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est atteinte.
- Explication : Il y a eu trop de requêtes envoyées à l'API dans la fenêtre autorisée, ce qui a atteint le débit limite. Pour éviter cela, il faut respecter le délai indiqué par l'erreur (Retry-After) et étaler les appels en réduisant le parallélisme et en utilisant des lots plus petits. Il est également important de vérifier que personne d'autre n'utilise la même clé au même moment.

### api-key-revoked-401
- Cause : L'API refuse l'identifiant du job : clé ou jeton révoqué, expiré ou remplacé (rotation des secrets) sans mise à jour côté job.
- Explication : L'API refuse l'identifiant du job car la clé ou le jeton est révoqué, expiré ou remplacé sans mise à jour côté job. Il faut générer une nouvelle clé et mettre à jour le secret utilisé par le job pour résoudre ce problème.

### vendor-maintenance-503
- Cause : Le service appelé répond 503 : maintenance ou surcharge chez le fournisseur, ou accès refusé aux clients non connectés ou non navigateurs (page réservée, pare-feu applicatif).
- Explication : Le serveur est actuellement indisponible en raison de maintenance ou surcharge. Il faut essayer à nouveau après quelques secondes, puis attendre la durée indiquée avant de réessayer.

### geocoding-quota-exceeded
- Cause : Le quota alloué par le fournisseur pour la période (jour, minute) est épuisé : le job consomme plus que prévu, ou d'autres usages partagent la même clé.
- Explication : Le quota alloué par le fournisseur pour la période est épuisé. Il faut attendre la remise à zéro du quota ou l'augmenter et répartir ou mettre en cache les appels pour éviter ce problème.

### csv-encoding-garbage — ❌ inventé : ancien_encodage
- Cause : Le fichier reçu n'est pas encodé en UTF-8 (UTF-16, Latin-1…) : le fournisseur a changé d'encodage ou d'outil d'export.
- Explication : Le fichier reçu n'est pas encodé en UTF-8, il faut donc le convertir pour qu'il puisse être lu correctement. Pour cela, utilisez l'outil iconv pour changer l'encodage du fichier vers UTF-8 : `iconv -f <ancien_encodage> -t UTF-8 entrée > sortie`.

### pub-pg-dump-version-mismatch-cron — ⚠ mécanisme perdu
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le serveur PostgreSQL est à une version majeure supérieure au binaire pg_dump utilisé par le cron. Pour résoudre ce problème, il faut utiliser un pg_dump de la même version que celle du serveur ou l'installer à jour pour qu'il corresponde à la version actuelle du serveur.

### pub-gitlab-backup-pg-dump-mismatch
- Cause : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
- Explication : Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL, ce qui cause une incompatibilité. Pour résoudre le problème, il faut utiliser un pg_dump de la même version que celle du serveur ou l'installer à jour pour qu'il corresponde à la version actuelle du serveur.

### pub-certbot-timeout-aaaa-old-provider
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le port 80 est bloqué par le pare-feu du serveur. Vous devez ouvrir ce port pour que Let's Encrypt puisse joindre votre serveur. Ensuite, vous devez corriger les enregistrements DNS A et AAAA pour qu'ils pointent vers votre serveur. Faites un test avec certbot renew --dry-run pour voir si cela fonctionne.

### pub-certbot-timeout-firewall-restarted
- Cause : Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou enregistrement DNS (A/AAAA) qui pointe ailleurs.
- Explication : Le port 80 est bloqué par le pare-feu du serveur. Vérifiez que vous pouvez accéder depuis Internet et corrigez les enregistrements DNS pour qu'ils pointent vers votre serveur.

### pub-mysqldump-lock-tables-privilege
- Cause : Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump.
- Explication : Le compte de sauvegarde n'a pas le privilège LOCK TABLES, ce qui empêche mysqldump d'accéder aux tables pour effectuer la sauvegarde. Pour résoudre le problème, vous pouvez ajouter --single-transaction (tables InnoDB) ou accorder GRANT LOCK TABLES au compte du cron.

### pub-velero-x509-unknown-authority
- Cause : Le certificat est signé par une autorité (CA interne ou auto-signée) absente du magasin de confiance de la machine du job.
- Explication : Le certificat utilisé pour se connecter à un serveur distant n'est pas signé par une autorité de confiance connue. Pour résoudre le problème, il faut ajouter la CA interne au magasin système ou donner l'outil les informations nécessaires pour reconnaître la CA.

### pub-weaviate-x509-legacy-cn
- Cause : Le certificat ne couvre pas ce nom d'hôte dans ses SAN (Subject Alternative Names) ; le Common Name seul n'est plus accepté.
- Explication : Le certificat ne couvre pas le nom d'hôte de l'hôte qui vous contacte. Vous devez régénérer le certificat avec les SAN corrects ou appeler l'hôte par un nom qu'il couvre.

### pub-aws-s3-sync-sso-expired — ⚠ mécanisme perdu
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job utilise des identifiants cloud temporaires qui ont expiré. Il faut donner au job des identifiants durables ou les rafraîchir avant expiration pour continuer à fonctionner.

### pub-s3-upload-expired-token
- Cause : Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de validité est dépassée.
- Explication : Le job utilise des identifiants cloud temporaires qui ont expiré. Il faut donner au job des identifiants durables ou les rafraîchir avant expiration pour continuer à fonctionner.

### pub-node-heap-oom-backup — ⚠ mécanisme perdu
- Cause : Le traitement charge plus de données que la limite de tas Node.js par défaut.
- Explication : Le traitement a chargé trop de données, ce qui a dépassé la limite de tas Node.js. Pour résoudre le problème, il faut traiter les données par lots ou augmenter la limite de tas pour éviter d'atteindre la limite de mémoire disponible.

### p2-cron-perm-denied-owner
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le problème est que le service qui écrit les logs n'a pas les droits nécessaires sur le fichier ou dossier. Pour résoudre cela, vous pouvez lancer le job sous l'utilisateur propriétaire du fichier (crontab -u <user>) ou ajuster les droits du dossier concerné (chown / chmod).

### p2-php-mysqli-env-vars
- Cause : Le client se connecte par le socket local parce que l'hôte vaut localhost ou est vide : variables de connexion (DB_HOST…) non définies dans l'environnement du cron, ou socket absent à ce chemin.
- Explication : Le client se connecte par le socket local car les variables de connexion (DB_HOST...) n'ont pas été définies dans l'environnement du cron. Pour résoudre ce problème, définissez ces variables dans la crontab ou le script et vérifiez le chemin du socket.

### p2-rake-path-rvm
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver les outils installés dans /usr/local/bin, nvm ou pyenv. Pour résoudre le problème, vous pouvez appeler la commande en chemin absolu (comme command -v rake pour trouver son emplacement) ou définir PATH= en tête de la crontab pour qu'il puisse les trouver automatiquement.

### p2-crontab-percent
- Cause : Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé (souvent dans date +%Y%m%d), d'où le guillemet ou la parenthèse jamais refermés.
- Explication : Une commande de crontab contenait un % qui a été mal interprété. Pour résoudre le problème, il faut échapper chaque % en \\ ou déplacer la commande dans un script appelé par le cron.

### p2-mysqldump-p-space
- Cause : Le mot de passe n'est pas transmis : MySQL demande « Enter password: » sans terminal puis se connecte sans mot de passe — option -p suivie d'un espace (-p secret est lu comme un nom de base) ou variable du mot de passe vide sous cron.
- Explication : Le mot de passe n'a pas été transmis correctement. Pour résoudre le problème, assurez-vous d'avoir un espace entre l'option -p et le mot de passe, ou utilisez un fichier ~/.my.cnf pour stocker votre mot de passe sécurisé.

### p2-pg-dump-pgpass-root
- Cause : PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'utilisateur du cron, mot de passe dont les caractères spéciaux ($, !, guillemets) sont déformés par le shell, ou règle pg_hba.conf manquante.
- Explication : Le mot de passe du job a changé et le shell a déformé les caractères spéciaux. Pour résoudre ce problème, veuillez vérifier si votre ~/.pgpass est présent et en mode 600 pour l'utilisateur du cron, ou utiliser la variable PGPASSFILE. Si vous n'avez pas de règle dans pg_hba.conf, ajoutez une nouvelle règle pour l'hôte/utilisateur/base et exécutez SELECT pg_reload_conf();

### p2-docker-no-space
- Cause : Le disque de Docker est plein : conteneurs arrêtés, images et volumes anonymes s'accumulent à chaque exécution (docker run sans --rm).
- Explication : Le disque de Docker est plein, ce qui empêche l'exécution de nouveaux conteneurs. Pour résoudre le problème, il faut nettoyer les images et volumes inutiles avec docker system prune et docker volume prune, puis relancer les conteneurs du job avec --rm pour éviter la réutilisation des espaces.

### p2-curl-60-ca-bundle
- Cause : Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine (CA interne, chaîne incomplète, ou magasin de certificats périmé).
- Explication : Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine, ce qui empêche le fonctionnement correct du job. Pour résoudre ce problème, mettez à jour le magasin de certificats ou passez la CA à utiliser pour éviter d'utiliser -k et relancez le job sous l'utilisateur approprié.

### p2-ffmpeg-display-boot
- Cause : DISPLAY est défini mais le serveur X refuse la connexion : le cookie XAUTHORITY de la session n'est pas lisible sous cron, ou la session graphique n'est pas encore prête (job lancé au démarrage, @reboot).
- Explication : Le problème est causé par le fait que le serveur X refuse la connexion car le cookie de session n'est pas lisible sous cron. Pour résoudre ce problème, il faut définir le chemin du fichier de cookie correctement dans la crontab et attendre que la session graphique soit prête avant exécuter le job.

### p2-python-ascii-encode
- Cause : cron s'exécute avec la locale POSIX/C (ASCII) : le programme ne peut pas écrire ou lire de caractères non ASCII.
- Explication : Le programme ne peut pas écrire ou lire des caractères non ASCII. Pour résoudre le problème, définissez LC_ALL=C.UTF-8 en tête de la crontab et vérifiez que cela fonctionne dans votre shell et dans le job.

### p2-node-path-global — ⚠ mécanisme perdu
- Cause : Node ne trouve pas le module dans l'environnement du cron : node_modules absents de ce dossier (cron démarre dans HOME), ou module installé globalement (npm -g) invisible sans NODE_PATH.
- Explication : Le cron ne peut pas trouver le module 'underscore' car il n'est pas dans le dossier node_modules du projet. Pour résoudre ce problème, vous devez faire cd dans le dossier du projet avant de lancer node et vérifier que node_modules existe après avoir exécuté npm ci.

### p2-aws-env-cron
- Cause : Le SDK cloud ne trouve pas d'identifiants : ~/.aws (ou équivalent) est dans le HOME d'un autre utilisateur, ou AWS_PROFILE n'est pas défini dans l'environnement du cron.
- Explication : Le SDK cloud ne peut pas trouver vos identifiants car ils sont stockés dans le HOME d'un autre utilisateur et non dans votre propre HOME. Vous devez donner à ce job ses propres identifiants pour qu'il puisse fonctionner correctement.

### p2-selenium-path
- Cause : Le navigateur lancé par le job ne démarre pas sous cron : PATH minimal où chrome et ses dépendances sont introuvables, ou pas d'affichage (mode headless non activé).
- Explication : Le navigateur Chrome ne démarre pas car son chemin est introuvable. Pour résoudre le problème, ajoutez la ligne suivante à la fin de votre fichier crontab : PATH=/usr/local/bin:/usr/bin:/usr/sbin:/bin. Ensuite, lancez Chrome avec les options --headless, --no-sandbox et --disable-dev-shm-usage pour éviter les erreurs.

### p2-git-ssh-key-cron — ⚠ mécanisme perdu
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car elle n'est pas associée à l'utilisateur du cron. Vous devez spécifier la clé correcte pour le job lancé sous cet utilisateur et vérifier que la clé publique est présente dans les autorisations du compte distant.

### p3-smtp-port-blocked — ⚠ mécanisme perdu
- Cause : Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sortant bloqué.
- Explication : Le problème est causé par un blocage de trafic sortant ou une route manquante. Vérifiez le VPN et la route vers le réseau, puis relancez pour résoudre le problème.

### p3-venv-env-var
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : Une variable d'environnement attendue par le job n'existe pas sous cron, car elle est définie dans votre shell mais non chargée. Pour résoudre ce problème, vous pouvez définir la variable en tête de la crontab ou charger explicitement la variable dans le script.

### p3-crontab-percent-date
- Cause : Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé (souvent dans date +%Y%m%d), d'où le guillemet ou la parenthèse jamais refermés.
- Explication : Une commande dans votre crontab contient des % qui sont interprétés comme des sauts de ligne. Pour résoudre le problème, vous devez échapper chaque % en \\ ou déplacer la commande dans un script appelé par le cron.

### p3-node-full-path
- Cause : cron lance la commande avec /bin/sh (dash sur Debian/Ubuntu), qui refuse la syntaxe bash ([[ ]], source, tableaux, ${…/…}).
- Explication : La commande cron utilise /bin/sh qui ne comprend pas certaines syntaxes bash. Pour résoudre le problème, vous pouvez lancer le script avec bash explicitement (bash script.sh) ou mettre SHELL=/bin/bash en tête de la crontab pour utiliser bash. Vérifiez que le shebang du script est correct et ajoutez cette ligne en tête de la crontab : SHELL=/bin/bash

### p3-java-classpath
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe com/gargoylesoftware/htmlunit/WebClient car le classpath du job est incomplet. Pour résoudre ce problème, assurez-vous de passer le classpath complet en chemins absolus dans la commande du cron.

### p3-scp-agent — ⚠ mécanisme perdu
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car elle n'est pas associée à l'utilisateur du cron. Vous devez spécifier la clé correcte pour l'utilisateur du cron et vérifier que la clé publique est présente dans les autorisations du compte distant.

### p3-activate-path-bashrc
- Cause : Le script active un virtualenv par un chemin introuvable sous cron (chemin relatif, PATH réduit, ou sh qui ne connaît pas source) : le bon environnement Python n'est jamais chargé.
- Explication : Le script tente d'activer un virtualenv, mais le chemin utilisé n'existe pas. Pour résoudre ce problème, utilisez directement le Python du virtualenv en appelant /chemin/venv/bin/python au lieu de source activate && python.

### p3-git-push-root-home
- Cause : Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, job lancé sous un autre utilisateur (root lit /root/.ssh, pas vos clés), ou clé absente d'authorized_keys.
- Explication : Le serveur SSH refuse votre clé car elle n'est pas associée à l'utilisateur du cron. Vous devez spécifier la clé correcte pour l'utilisateur du cron et vérifier que la clé publique est présente dans les autorisations du compte distant.

### p4-python3-import
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le problème vient du fait que le cron utilise un autre interpréteur Python qui n'a pas les paquets pip installés. Pour résoudre cela, il faut utiliser l'interpréteur Python du virtualenv en chemin absolu et vérifier que la dépendance est installée dans ce venv.

### p4-shebang-hidden-chars
- Cause : La première ligne #! n'est pas reconnue : elle contient des caractères invisibles (BOM UTF-8 en tête de fichier ou fin de ligne Windows), le shell la prend pour une commande.
- Explication : Le shell ne reconnaît pas la première ligne du fichier en raison de caractères invisibles. Pour résoudre le problème, réécrivez la première ligne ou nettoyez le fichier pour supprimer ces caractères et relancez le script.

### p4-rsync-process-subst-sh
- Cause : La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh, qui ne la comprend pas.
- Explication : Le script utilise des commandes bash qui ne sont pas compatibles avec le shell sh utilisé par le cron. Pour résoudre ce problème, vous pouvez lancer le script avec bash ou spécifier le shell à utiliser dans la crontab.

### p4-git-ssh-agent — ⚠ mécanisme perdu
- Cause : Git ne peut pas lire le dépôt distant : sous cron, la clé SSH de votre session n'est pas disponible (pas d'agent, autre HOME), ou la clé n'a pas accès à ce dépôt.
- Explication : Le problème est que le cron n'a pas accès à votre clé SSH, ce qui empêche Git de communiquer avec le dépôt distant. Pour résoudre cela, vous devez ajouter une ligne au fichier crontab pour utiliser une clé dédiée sans passphrase et ajouter cette clé au dépôt comme clé de déploiement.

### p4-npm-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver les outils installés dans les chemins supplémentaires (/usr/local/bin, nvm, pyenv). Pour résoudre le problème, vous pouvez appeler la commande en chemin absolu (utiliser `command -v <outil>` pour trouver le chemin exact) ou définir le PATH à l'avant de la crontab. Cela devrait permettre au cron d'accéder aux outils nécessaires.

### p4-java-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver votre outil Java dans les répertoires standard. Vous devez appeler la commande en chemin absolu ou ajouter le chemin à la liste du PATH pour que le cron puisse l'identifier.

### p4-gsutil-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver les outils installés dans /usr/local/bin, nvm ou pyenv. Pour résoudre le problème, vous pouvez appeler la commande en chemin absolu (par exemple, `command -v gsutil` pour trouver son emplacement) ou définir le PATH à l'avant de la crontab.

### p4-date-percent
- Cause : La commande contient un % non échappé : dans une crontab, % est un saut de ligne, la commande est coupée à cet endroit.
- Explication : Une commande de crontab contient un % non échappé, ce qui fait coupure à cet endroit. Pour résoudre le problème, il faut échapper chaque % en \\ ou déplacer la commande dans un script.

### p4-crontab-backquote
- Cause : crontab refuse le fichier : une ligne a une syntaxe invalide (champ horaire faux, ou backquote / % non échappé), donc aucun job de ce fichier n'est installé.
- Explication : Une erreur dans le fichier de crontab a empêché l'installation du job. La ligne incorrecte contient une syntaxe invalide, spécifiquement un caractère `%` non échappé. Pour résoudre ce problème, remplacez les backquotes par $(…), échappez `% en \

### p4-php-relative-require
- Cause : Le job ouvre un fichier par un chemin relatif : sous cron, le dossier courant est le HOME de l'utilisateur, pas celui du script, donc le chemin ne pointe plus au bon endroit.
- Explication : Le problème est que le script ouvre un fichier en utilisant un chemin relatif qui pointe vers le mauvais dossier. Pour résoudre cela, il faut utiliser des chemins absolus ou changer de dossier avant d'exécuter la commande. Vous pouvez vérifier le dossier courant sous cron en ajoutant 'pwd' au début du job et remplacer les chemins relatifs par des chemins absolus pour éviter ce problème.

### p4-pgpassword-quotes
- Cause : PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'utilisateur du cron, mot de passe dont les caractères spéciaux ($, !, guillemets) sont déformés par le shell, ou règle pg_hba.conf manquante.
- Explication : Le mot de passe du job a changé et le shell a déformé les caractères spéciaux. Pour résoudre ce problème, veuillez vérifier si votre ~/.pgpass est présent et en mode 600 pour l'utilisateur du cron, ou utiliser la variable PGPASSFILE. Ensuite, assurez-vous que vous avez ajouté une règle dans pg_hba.conf pour autoriser les connexions de l'hôte/utilisateur/base et exécutez SELECT pg_reload_conf();

### p4-bundle-path-environment
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver l'outil 'bundle' dans les chemins de recherche par défaut. Pour résoudre le problème, vous pouvez essayer d'appeler la commande en chemin absolu ou de définir le PATH à la tête de la crontab pour inclure les chemins où l'outil est installé.

### p4-cron-no-user-var — ⚠ mécanisme perdu
- Cause : Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie dans votre shell (.bashrc, .profile, activate du virtualenv, /etc/environment), que cron ne charge pas ; même USER peut manquer.
- Explication : Une variable d'environnement attendue par le job n'existe pas sous cron, car elle est définie dans votre shell mais non chargée. Pour résoudre ce problème, vous pouvez définir la variable en tête de la crontab ou charger explicitement la variable dans le script.

### p5-ruby-shebang-127
- Cause : Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) ou son nom est faux.
- Explication : La commande que vous essayez d'exécuter n'est pas trouvée dans le chemin PATH du cron. Vous devez appeler la commande en chemin absolu ou modifier le chemin PATH pour qu'il inclut le répertoire où se trouve la commande.

### p5-crontab-percent-expr
- Cause : Le journal de cron montre la commande coupée juste avant un % : dans une crontab, % est un saut de ligne, la suite de la commande n'est jamais exécutée.
- Explication : Une commande de cron a été coupée juste avant le symbole '%', ce qui signifie que le système a interprété % comme un saut de ligne et a arrêté l'exécution. Pour résoudre le problème, il faut échapper chaque '%' en '\

### p5-cronhourly-crontab-syntax — ❌ inventé : /usr/bin.
- Cause : Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) ou son nom est faux.
- Explication : La commande curl n'a pas été trouvée dans le chemin PATH du cron. Il faut appeler la commande en chemin absolu ou modifier le chemin PATH pour qu'il inclut /usr/bin. L'erreur se reproduit également lorsque l'on utilise un environnement simulant le cron, ce qui confirme que le problème est lié au chemin PATH.

### p5-python-version-import
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le problème vient du fait que le cron utilise un autre interpréteur Python qui n'a pas les paquets pip installés. Pour résoudre cela, il faut utiliser l'interpréteur Python du virtualenv en chemin absolu et vérifier que la dépendance est installée dans ce venv.

### p5-env-node-bashrc — ⚠ mécanisme perdu
- Cause : L'interpréteur indiqué par le shebang (#!) n'existe pas à ce chemin, ou /usr/bin/env ne le trouve pas dans le PATH minimal du cron.
- Explication : Le script utilise un interpréteur qui n'existe pas à ce chemin, donc il faut utiliser le chemin absolu correct de l'interpréteur dans le shebang. Pour trouver le chemin absolu, utilisez la commande `command -v python3` pour vérifier que l'interpréteur est bien installé et qu'il existe à ce chemin.

### p5-unixcat-path
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver l'outil 'unixcat' dans les chemins de recherche par défaut. Pour résoudre le problème, vous pouvez essayer d'appeler la commande en chemin absolu ou de définir le chemin de recherche PATH à l'avance pour que le cron puisse trouver l'outil.

### p5-proxy-env-cron — ⚠ mécanisme perdu
- Cause : Le service distant ne répond pas dans le délai : indisponible, surchargé, pare-feu qui jette les paquets sans refuser, ou proxy défini dans votre session (http_proxy) mais absent sous cron.
- Explication : Le service distant est indisponible ou surchargé, ce qui fait que les paquets ne sont pas traités dans le délai attendu. Vérifiez l'état du service en utilisant la commande nc -zv et réessayez avec un délai plus long après vérification de son état.

### p6-java-noclassdef-pom
- Cause : La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désignés en chemin relatif ou CLASSPATH défini seulement dans votre shell).
- Explication : La JVM ne trouve pas la classe JsonFactory car le chemin du classpath est incomplet. Vous devez passer le chemin complet des classes dans la commande de cron, en utilisant des chemins absolus et en incluant les fichiers lib/* pour tous les jars d'un dossier.

### p6-rake-bundle-env
- Cause : cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/local/bin, nvm, pyenv) est introuvable.
- Explication : Le cron a démarré avec un chemin de recherche minimal, ce qui signifie qu'il ne peut pas trouver l'outil 'bundle' dans les chemins de recherche par défaut. Pour résoudre le problème, vous pouvez essayer d'appeler la commande en chemin absolu ou de définir le PATH à la tête de la crontab pour inclure les chemins où l'outil est installé.

### p6-pgdump-crlf — ⚠ mécanisme perdu
- Cause : Les options de la commande se retrouvent seules sur une ligne : la continuation « \ » est cassée (fins de ligne Windows \r, ou espace après le \), donc chaque ligne est lancée comme une commande à part.
- Explication : Le problème est que les options de la commande sont sur une seule ligne, ce qui fait qu'elle est traitée comme une commande à part. Pour résoudre cela, il faut convertir le script pour qu'il n'y ait plus d'espace après les \

### p6-redis-dump-umask
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le fichier de sauvegarde Redis a des droits trop restrictifs, ce qui empêche le service Redis d'écrire dans le dossier. Pour résoudre le problème, vous pouvez essayer de lancer le job sous l'utilisateur propriétaire du dossier ou ajuster les droits du dossier pour que le service Redis puisse écrire-y.

### p6-wget-503-auth
- Cause : Le service appelé répond 503 : maintenance ou surcharge chez le fournisseur, ou accès refusé aux clients non connectés ou non navigateurs (page réservée, pare-feu applicatif).
- Explication : Le serveur est actuellement indisponible en raison de maintenance ou surcharge. Réessayer après quelques secondes et attendre la durée indiquée dans l'erreur (Retry-After).

### p6-logrotate-create-perms
- Cause : L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appartient à un autre utilisateur (www-data, root…), ou le service qui l'écrit le crée avec des droits restrictifs (umask du service, rotation de logs).
- Explication : Le fichier log est protégé par un autre utilisateur (www-data ou root) et le service rsyslogd n'a pas les droits pour l'accéder. Pour résoudre ce problème, vous pouvez essayer de lancer le job sous l'utilisateur propriétaire du fichier (crontab -u <user>) ou ajuster les droits du dossier concerné (chown / chmod). Vérifiez d'abord qui est le propriétaire du fichier en utilisant ls -l <chemin> et comparez-le avec l'utilisateur du cron.

### p6-sudo-root-module — ⚠ mécanisme perdu
- Cause : Le module n'est pas installé pour l'interpréteur ou l'utilisateur du cron : autre interpréteur Python (virtualenv non activé, autre version), ou job lancé sous un autre utilisateur (root via sudo crontab) qui n'a pas vos paquets pip --user.
- Explication : Le problème vient du fait que le cron utilise un autre interpréteur Python qui n'a pas les paquets pip installés. Pour résoudre cela, il faut utiliser l'interpréteur Python du virtualenv en chemin absolu et vérifier que la dépendance est installée dans ce venv.

### p6-mysql-2002-disk-full — ⚠ mécanisme perdu
- Cause : Le serveur MySQL local ne tourne pas (arrêté, ou il n'a pas pu démarrer : disque plein, configuration invalide — voir son journal), ou le client cherche le socket à un autre chemin que celui du serveur.
- Explication : Le serveur MySQL n'est pas en cours d'exécution ou ne peut pas démarrer. Vérifiez et redémarrez le service MySQL, ou utilisez TCP pour se connecter au serveur local à l'adresse 127.0.0.1 et spécifiez le bon chemin du socket.
