# Note de l'IA CronGuard — 6.6/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-08 · modèle `llama3.2:3b` · 2 run(s) · jeu `all` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **6.6** (IC95 6.5 à 6.8, runs 6.7 · 6.5) |
| Pannes couvertes par une correction connue (32 cas) | 8.4 |
| Pannes **non** couvertes (22 cas) — le vrai test du modèle | 4.0 |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | 7.1 / 8.7 |
| **Jeu public2 — test hors échantillon** (collecté après le gel des fiches) | **4.6** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 56 % |
| Action juste et sûre (3) | 61 % |
| Catégorie (1) | 81 % |
| Rien d'inventé (1) | 98 % |
| Preuve liée (1) | 87 % |

Latence médiane 12.9 s · réponses parsables 100 %.

## A/B : LLM_CRON_HINTS=on

| | A (actuel) | B |
|---|---|---|
| Note | 6.6 | 6.7 |
| Couvertes / non couvertes | 8.4 / 4.0 | 8.4 / 4.2 |
| Cause = mécanisme | 56 % | 57 % |

Différence B − A : **0.1** (IC95 -0.2 à 0.4)

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| geocoding-quota-exceeded | lab | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé (code 403) |
| p2-cron-malware | public2 | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | cron service arrêté par signal SIGKILL |
| typeerror-undefined-prop | lab | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe dans une requête SQL |
| p2-cron-perm-denied-owner | public2 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé |
| p2-php-mysqli-env-vars | public2 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | No such file or directory |
| p2-docker-no-space | public2 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute d |
| p2-ffmpeg-display-boot | public2 | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Le job lance un programme graphique ou D-Bus, mais cron n'a pas de session graphique : DIS |
| p2-selenium-path | public2 | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Chrome failed to start: exited abnormally |
| p2-spring-sftp-duplicate | public2 | non | 2.5 | cause : symptôme ou mauvaise cause ; action hors sujet | Problem occurred while synchronizing '/remote-file-path' to local directory |
| api-key-revoked-401 | lab | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé |
| syntax-error-bad-deploy | lab | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe |
| schema-drift-extra-column | lab | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Parquet schema mismatch |
| pub-borg-not-found-cron-path | public | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | BORG non installé sur ce système |
| p2-crontab-percent | public2 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe |
| p2-php-oom-ssh-safe-mode | public2 | non | 3.0 | cause : symptôme ou mauvaise cause ; action hors sujet | mémoire insuffisante |
| p2-rake-path-rvm | public2 | non | 3.5 | cause : symptôme ou mauvaise cause ; catégorie code ≠ dependency | commande 'rake' introuvable |
| watchdog-sigkill | lab | oui | 4.0 | cause : symptôme ou mauvaise cause ; preuve : ligne décisive non liée | Le job a dépassé la durée maximale qui lui est accordée (timeout, TimeoutStartSec, watchdo |
| p2-curl-60-ca-bundle | public2 | non | 4.5 | cause : symptôme ou mauvaise cause ; preuve : ligne décisive non liée | certificat ou TLS |
| oom-killer-137 | lab | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué  |
| python-keyerror | lab | non | 5.0 | cause : symptôme ou mauvaise cause ; catégorie data ≠ code | KeyError 'gross_amount_eur' lors de la récupération des données |
| validation-null-ids | lab | non | 5.0 | cause : symptôme ou mauvaise cause ; preuve : ligne décisive non liée | contrainte violated |
| p2-mysqldump-p-space | public2 | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | MySQL refuse les identifiants du job : mot de passe changé, fichier ~/.my.cnf absent pour  |
| p2-node-path-global | public2 | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Node ne trouve pas le module : node_modules non installés à cet endroit, ou cron lance le  |
| route-unreachable-vpn | lab | non | 6.0 | action hors sujet ; catégorie dependency ≠ network | LDAP sync failed due to VPN tunnel to datacenter appearing down |
| unhandled-rejection-null-order | lab | non | 6.0 | cause : symptôme ou mauvaise cause | Unhandled promise rejection avec erreur TypeError |
| dns-resolution-failure | lab | oui | 7.0 | action hors sujet | Le nom d'hôte ne se résout pas : résolveur DNS injoignable, nom erroné ou enregistrement s |
| tls-cert-expired | lab | oui | 7.0 | action dangereuse | Le certificat TLS du serveur appelé est expiré : son renouvellement automatique n'a pas eu |
| pub-velero-x509-unknown-authority | public | oui | 7.0 | action dangereuse | Le certificat est signé par une autorité (CA interne ou auto-signée) absente du magasin de |
| pub-aws-s3-sync-sso-expired | public | oui | 7.0 | action hors sujet | Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de vali |
| vendor-maintenance-503 | lab | non | 8.5 | action hors sujet | API est en ligne pour maintenance |
| econnreset-mid-transfer | lab | non | 9.0 | inventé : retry_count | Connection reset by peer during transfer |
| http-client-timeout | lab | non | 9.0 | catégorie network ≠ timeout | curl: Operation timed out after 30000 milliseconds with 0 bytes received |
| pub-weaviate-x509-legacy-cn | public | oui | 9.0 | preuve : ligne décisive non liée | Le certificat ne couvre pas ce nom d'hôte dans ses SAN (Subject Alternative Names) ; le Co |
| pg-connection-refused | lab | oui | 10.0 | — | Le serveur PostgreSQL n'écoute pas à cette adresse : service arrêté ou redémarré, ou liste |
| pg-too-many-connections | lab | oui | 10.0 | — | Toutes les connexions PostgreSQL sont prises (limite max_connections atteinte), souvent pa |
| mysql-deadlock | lab | oui | 10.0 | — | Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la  |
| pg-disk-full-wal | lab | oui | 10.0 | — | Le volume de PostgreSQL est plein à cause de pg_wal : un slot de réplication inactif ou un |
| query-statement-timeout | lab | oui | 10.0 | — | La requête dépasse statement_timeout : la table a grossi ou un index manque, la requête es |
| disk-full-enospc | lab | oui | 10.0 | — | Le volume de destination est plein : des fichiers s'accumulent (sauvegardes, logs) faute d |
| fork-cannot-allocate | lab | oui | 10.0 | — | Le système refuse de créer de nouveaux processus : mémoire libre épuisée ou limite de proc |
| inode-exhaustion | lab | oui | 10.0 | — | Le système de fichiers n'a plus d'inodes : trop de petits fichiers, alors qu'il reste de l |
| stripe-rate-limit-429 | lab | oui | 10.0 | — | Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est attei |
| csv-encoding-garbage | lab | oui | 10.0 | — | Le fichier reçu n'est pas encodé en UTF-8 (UTF-16, Latin-1…) : le fournisseur a changé d'e |
| pub-pg-dump-version-mismatch-cron | public | oui | 10.0 | — | Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version  |
| pub-gitlab-backup-pg-dump-mismatch | public | oui | 10.0 | — | Le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version  |
| pub-certbot-timeout-aaaa-old-provider | public | oui | 10.0 | — | Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou e |
| pub-certbot-timeout-firewall-restarted | public | oui | 10.0 | — | Let's Encrypt ne joint pas le serveur sur le port 80 : pare-feu, redirection de port, ou e |
| pub-mysqldump-lock-tables-privilege | public | oui | 10.0 | — | Le compte de sauvegarde n'a pas le privilège LOCK TABLES exigé par mysqldump. |
| pub-s3-upload-expired-token | public | oui | 10.0 | — | Le job utilise des identifiants cloud temporaires (session SSO, STS) dont la durée de vali |
| pub-node-heap-oom-backup | public | oui | 10.0 | — | Le traitement charge plus de données que la limite de tas Node.js par défaut. |
| p2-pg-dump-pgpass-root | public2 | oui | 10.0 | — | PostgreSQL refuse les identifiants du job : mot de passe changé, ~/.pgpass absent pour l'u |
| p2-python-ascii-encode | public2 | oui | 10.0 | — | cron s'exécute avec la locale POSIX/C (ASCII) : le programme ne peut pas écrire ou lire de |
| p2-aws-env-cron | public2 | oui | 10.0 | — | Le SDK cloud ne trouve pas d'identifiants : ~/.aws (ou équivalent) est dans le HOME d'un a |
| p2-git-ssh-key-cron | public2 | oui | 10.0 | — | Le serveur SSH refuse la clé : sous cron, pas d'agent SSH ni la clé de votre session, ou c |
