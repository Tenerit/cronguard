# Note de l'IA CronGuard — 7.6/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-10 · modèle `llama3.2:3b` · 2 run(s) · jeu `final` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **7.6** (IC95 7.6 à 7.6, runs 7.6 · 7.6) |
| Pannes couvertes par une correction connue (68 cas) | 9.2 |
| Pannes **non** couvertes (29 cas) — le vrai test du modèle | 4.0 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | 8.3 / 9.0 |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | 7.9 |
| Jeu public3 (lu le 2026-11-08 : devenu réglage) | 5.5 |
| Jeu public4 (lu le 2026-11-08 : devenu réglage) | 8.2 |
| **Jeu public5 — TEST hors échantillon (collecté après tous les changements)** | **6.0** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 66 % |
| Action juste et sûre (3) | 74 % |
| Catégorie (1) | 84 % |
| Rien d'inventé (1) | 94 % |
| Preuve liée (1) | 90 % |

Latence médiane 0.0 s · réponses parsables 100 %.

## A/B : LLM_HYPOTHESES=v2

| | A (actuel) | B |
|---|---|---|
| Note | 7.6 | 7.5 |
| Couvertes / non couvertes | 9.2 / 4.0 | 9.2 / 3.6 |
| Cause = mécanisme | 66 % | 65 % |

Différence B − A : **-0.1** (IC95 -0.2 à -0.0)

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| p3-node-full-path | public3 | oui | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | cron lance la commande avec /bin/sh (dash sur Debian/Ubuntu), qui refuse la syntaxe bash ( |
| p3-venv-activate-path | public3 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « ' (Is it on sys.path? Is there an  |
| p5-perl-env-login-shell | public5 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet |  mémoire insuffisante |
| p2-cron-malware | public2 | non | 1.5 | cause : symptôme ou mauvaise cause ; action hors sujet | cron service arrêté par systemd en raison d'un processus mort (code 9/KILL) |
| typeerror-undefined-prop | lab | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe dans une requête SQL |
| p3-ruby-rvm-env | public3 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | exit code 1, erreur de CRON |
| p3-tar-path-spaces | public3 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | élément introuvable |
| p3-notify-send-display | public3 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « ** (other.py:16509): WARNING **: C |
| p4-python-version-cron | public4 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | syntax error |
| p5-proxy-env-cron | public5 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le service distant ne répond pas dans le délai : indisponible, surchargé, ou pare-feu qui  |
| pub-borg-not-found-cron-path | public | non | 2.5 | cause : symptôme ou mauvaise cause ; action hors sujet | BORG non installé sur ce système |
| syntax-error-bad-deploy | lab | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe |
| p2-ffmpeg-display-boot | public2 | oui | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le job lance un programme graphique ou D-Bus, mais cron n'a pas de session graphique : DIS |
| p2-php-oom-ssh-safe-mode | public2 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | mémoire insuffisante |
| p3-mysqldump-password-unquoted | public3 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | élément introuvable 'Gp+cYE2!' |
| p3-rsync-e-quotes | public3 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « rsync: link_stat "/Users/yyyyy_yyy |
| p5-cronhourly-crontab-syntax | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; catégorie dependency ≠ code | Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) o |
| p5-macos-tcc-trash | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « PermissionError: [Errno 1] Operati |
| p5-wget-ssl-status5 | public5 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « grandchild #20349 failed with stat |
| validation-null-ids | lab | non | 3.5 | cause : symptôme ou mauvaise cause ; action hors sujet | batch QUARANTINED en raison d'une qualité de score inférieure à la limite de 99,5% |
| p2-spring-sftp-duplicate | public2 | non | 3.5 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « 2024-09-13T10:50:02.499-04:00 ERRO |
| p4-sh-run-by-python | public4 | non | 4.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « SyntaxError: invalid syntax ». Voi |
| p5-php-set-time-limit | public5 | non | 4.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Cause non établie par l'analyse : le job s'arrête sur « [01-Mar-2012 00:32:57 UTC] PHP Fat |
| p4-display-xauthority | public4 | non | 4.5 | cause : symptôme ou mauvaise cause ; catégorie code ≠ dependency | Cause non établie par l'analyse : le job s'arrête sur « RuntimeError: could not open displ |
| watchdog-sigkill | lab | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdo |
| p4-laravel-mail-template | public4 | non | 5.5 | cause : symptôme ou mauvaise cause ; abstention honnête (+1) | Cause non établie par l'analyse : le job s'arrête sur « local.ERROR: exception 'ErrorExcep |
| oom-killer-137 | lab | oui | 6.0 | cause : symptôme ou mauvaise cause | Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué  |
| python-keyerror | lab | non | 6.0 | cause : symptôme ou mauvaise cause | KeyError 'gross_amount_eur' dans le fichier de logs |
| p2-mysqldump-p-space | public2 | oui | 6.0 | cause : symptôme ou mauvaise cause | MySQL refuse les identifiants du job : mot de passe changé, fichier ~/.my.cnf absent pour  |
| p3-git-push-root-home | public3 | oui | 6.0 | cause : symptôme ou mauvaise cause | Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, ou c |
| p4-pgpassword-quotes | public4 | oui | 6.0 | cause : symptôme ou mauvaise cause | PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'u |
| schema-drift-extra-column | lab | non | 6.5 | cause : symptôme ou mauvaise cause ; abstention honnête (+1) | Cause non établie par l'analyse : le job s'arrête sur « Error: Parquet schema mismatch: so |
| dns-resolution-failure | lab | oui | 7.0 | action hors sujet | Le nom d'hôte ne se résout pas : résolveur DNS injoignable, nom erroné ou enregistrement s |
| pub-aws-s3-sync-sso-expired | public | oui | 7.0 | action hors sujet | Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de vali |
| p3-smtp-port-blocked | public3 | oui | 7.0 | action hors sujet | Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sor |
| p5-svn-sshpass-noninteractive | public5 | non | 7.5 | catégorie network ≠ dependency ; cause : symptôme ou mauvaise cause | Cause non établie par l'analyse : le job s'arrête sur « svn: E215004: Authentication faile |
| p4-rsync-process-subst-sh | public4 | non | 8.0 | inventé : script.sh, /bin/bash ; preuve : ligne décisive non liée | La commande utilise une syntaxe bash (source, <( ), [[ ]]) mais elle est exécutée par sh,  |
| unhandled-rejection-null-order | lab | non | 8.5 | cause : symptôme ou mauvaise cause ; abstention honnête (+1) | Cause non établie par l'analyse : le job s'arrête sur « [ERROR] Unhandled promise rejectio |
| fork-cannot-allocate | lab | oui | 9.0 | preuve : ligne décisive non liée | Le système refuse de créer de nouveaux processus : mémoire libre épuisée ou limite de proc |
| pub-weaviate-x509-legacy-cn | public | oui | 9.0 | preuve : ligne décisive non liée | Le certificat ne couvre pas ce nom d'hôte dans ses SAN (Subject Alternative Names) ; le Co |
| p2-php-mysqli-env-vars | public2 | oui | 9.0 | catégorie database ≠ dependency | Le client se connecte par le socket local parce que l'hôte vaut localhost ou est vide : va |
| p2-curl-60-ca-bundle | public2 | non | 9.0 | inventé : --cacert | Le certificat du serveur n'est pas vérifiable avec les autorités connues de la machine (CA |
| p5-ruby-shebang-127 | public5 | non | 9.0 | inventé : /usr/bin | Code 127 : la commande est introuvable dans le PATH du cron (PATH minimal /usr/bin:/bin) o |
| pg-connection-refused | lab | oui | 10.0 | — | Le serveur PostgreSQL n'écoute pas à cette adresse : service arrêté ou redémarré, ou liste |
| pg-too-many-connections | lab | oui | 10.0 | — | Toutes les connexions PostgreSQL sont prises (limite max_connections atteinte), souvent pa |
| mysql-deadlock | lab | oui | 10.0 | — | Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la  |
| pg-disk-full-wal | lab | oui | 10.0 | — | Le volume de PostgreSQL est plein à cause de pg_wal : un slot de réplication inactif ou un |
| tls-cert-expired | lab | oui | 10.0 | — | Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu |
| econnreset-mid-transfer | lab | oui | 10.0 | — | L'autre côté a coupé la connexion en cours de route : redémarrage ou timeout côté serveur, |
| route-unreachable-vpn | lab | oui | 10.0 | — | Aucune route vers l'hôte : tunnel VPN ou lien réseau tombé, route manquante, ou trafic sor |
| http-client-timeout | lab | oui | 10.0 | — | Le service distant ne répond pas dans le délai : indisponible, surchargé, ou pare-feu qui  |
| query-statement-timeout | lab | oui | 10.0 | — | La requête dépasse statement_timeout : la table a grossi ou un index manque, la requête es |
| disk-full-enospc | lab | oui | 10.0 | — | Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute d |
| inode-exhaustion | lab | oui | 10.0 | — | Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l |
| stripe-rate-limit-429 | lab | oui | 10.0 | — | Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est attei |
| api-key-revoked-401 | lab | oui | 10.0 | — | L'API refuse l'identifiant du job : clé ou jeton révoqué, expiré ou remplacé (rotation des |
| vendor-maintenance-503 | lab | oui | 10.0 | — | Le service appelé est temporairement indisponible (maintenance ou surcharge) : la panne es |
| geocoding-quota-exceeded | lab | oui | 10.0 | — | Le quota alloué par le fournisseur pour la période (jour, minute) est épuisé : le job cons |
| csv-encoding-garbage | lab | oui | 10.0 | — | Le fichier reçu n'est pas encodé en UTF-8 (UTF-16, Latin-1…) : le fournisseur a changé d'e |
| pub-pg-dump-version-mismatch-cron | public | oui | 10.0 | — | Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version  |
| pub-gitlab-backup-pg-dump-mismatch | public | oui | 10.0 | — | Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version  |
| pub-certbot-timeout-aaaa-old-provider | public | oui | 10.0 | — | Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou e |
| pub-certbot-timeout-firewall-restarted | public | oui | 10.0 | — | Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou e |
| pub-mysqldump-lock-tables-privilege | public | oui | 10.0 | — | Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump. |
| pub-velero-x509-unknown-authority | public | oui | 10.0 | — | Le certificat est signé par une autorité (CA interne ou auto-signée) absente du magasin de |
| pub-s3-upload-expired-token | public | oui | 10.0 | — | Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de vali |
| pub-node-heap-oom-backup | public | oui | 10.0 | — | Le traitement charge plus de données que la limite de tas Node.js par défaut. |
| p2-cron-perm-denied-owner | public2 | oui | 10.0 | — | L'utilisateur qui exécute le cron n'a pas les droits sur ce fichier ou dossier : il appart |
| p2-rake-path-rvm | public2 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p2-crontab-percent | public2 | oui | 10.0 | — | Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé |
| p2-pg-dump-pgpass-root | public2 | oui | 10.0 | — | PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'u |
| p2-docker-no-space | public2 | oui | 10.0 | — | Le disque de Docker est plein : conteneurs arrêtés, images et volumes anonymes s'accumulen |
| p2-python-ascii-encode | public2 | oui | 10.0 | — | cron s'exécute avec la locale POSIX/C (ASCII) : le programme ne peut pas écrire ou lire de |
| p2-node-path-global | public2 | oui | 10.0 | — | Node ne trouve pas le module dans l'environnement du cron : node_modules absents de ce dos |
| p2-aws-env-cron | public2 | oui | 10.0 | — | Le SDK cloud ne trouve pas d'identifiants : ~/.aws (ou équivalent) est dans le HOME d'un a |
| p2-selenium-path | public2 | oui | 10.0 | — | Le navigateur lancé par le job ne démarre pas sous cron : PATH minimal où chrome et ses dé |
| p2-git-ssh-key-cron | public2 | oui | 10.0 | — | Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, ou c |
| p3-venv-env-var | public3 | oui | 10.0 | — | Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie |
| p3-crontab-percent-date | public3 | oui | 10.0 | — | Dans une crontab, % est un saut de ligne : la commande est coupée au premier % non échappé |
| p3-java-classpath | public3 | oui | 10.0 | — | La JVM ne trouve pas une classe : le classpath du job est incomplet sous cron (jars désign |
| p3-scp-agent | public3 | oui | 10.0 | — | Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, ou c |
| p3-activate-path-bashrc | public3 | oui | 10.0 | — | Le script active un virtualenv par un chemin introuvable sous cron (chemin relatif, PATH r |
| p4-python3-import | public4 | oui | 10.0 | — | cron lance un autre interpréteur Python que le vôtre (virtualenv non activé, autre version |
| p4-shebang-hidden-chars | public4 | oui | 10.0 | — | La première ligne #! n'est pas reconnue : elle contient des caractères invisibles (BOM UTF |
| p4-git-ssh-agent | public4 | oui | 10.0 | — | Git ne peut pas lire le dépôt distant : sous cron, la clé SSH de votre session n'est pas d |
| p4-npm-path | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-java-path | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-gsutil-path | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-date-percent | public4 | oui | 10.0 | — | La commande contient un % non échappé : dans une crontab, % est un saut de ligne, la comma |
| p4-crontab-backquote | public4 | oui | 10.0 | — | crontab refuse le fichier : une ligne a une syntaxe invalide (champ horaire faux, ou backq |
| p4-php-relative-require | public4 | oui | 10.0 | — | Le job ouvre un fichier par un chemin relatif : sous cron, le dossier courant est le HOME  |
| p4-bundle-path-environment | public4 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
| p4-cron-no-user-var | public4 | oui | 10.0 | — | Une variable d'environnement attendue par le job n'existe pas sous cron : elle est définie |
| p5-crontab-percent-expr | public5 | oui | 10.0 | — | Le journal de cron montre la commande coupée juste avant un % : dans une crontab, % est un |
| p5-python-version-import | public5 | oui | 10.0 | — | cron lance un autre interpréteur Python que le vôtre (virtualenv non activé, autre version |
| p5-env-node-bashrc | public5 | oui | 10.0 | — | L'interpréteur indiqué par le shebang (#!) n'existe pas à ce chemin, ou /usr/bin/env ne le |
| p5-unixcat-path | public5 | oui | 10.0 | — | cron démarre avec un PATH minimal (/usr/bin:/bin) : la commande installée ailleurs (/usr/l |
