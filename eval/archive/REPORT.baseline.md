# Note de l'IA CronGuard — 4.4/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis `npx tsx eval/score.ts --validate`

Mesuré le 2026-11-08 · modèle `llama3.2:3b` · 3 run(s) · jeu `all` · notation automatique (`eval/rubric.ts`).

| | Note /10 |
|---|---|
| **Globale** | **4.4** (IC95 4.3 à 4.6, runs 4.6 · 4.4 · 4.3) |
| Pannes couvertes par une correction connue (20 cas) | 4.9 |
| Pannes **non** couvertes (17 cas) — le vrai test du modèle | 3.9 |
| Jeu labo (réglage) / jeu public (pannes réelles sourcées) | 4.7 / 3.8 |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | 30 % |
| Action juste et sûre (3) | 41 % |
| Catégorie (1) | 72 % |
| Rien d'inventé (1) | 98 % |
| Preuve liée (1) | 88 % |

Latence médiane 13.2 s · réponses parsables 100 %.

## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
| geocoding-quota-exceeded | lab | non | 0.3 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé (resource exhausted) |
| typeerror-undefined-prop | lab | non | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe dans une requête SQL |
| pub-velero-x509-unknown-authority | public | oui | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | backup store pour la location 'default' est invalide : rpc error : code = Unknown desc = R |
| pub-s3-upload-expired-token | public | oui | 1.0 | cause : symptôme ou mauvaise cause ; action hors sujet | token a expiré |
| watchdog-sigkill | lab | non | 1.7 | cause : symptôme ou mauvaise cause ; action hors sujet | dépassement de délai, job terminé après 3630s |
| api-key-revoked-401 | lab | non | 1.7 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé |
| csv-encoding-garbage | lab | non | 1.7 | cause : symptôme ou mauvaise cause ; action hors sujet | UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 0: invalid start byte |
| mysql-deadlock | lab | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | Deadlock found when trying to get lock |
| disk-full-enospc | lab | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | disque plein |
| syntax-error-bad-deploy | lab | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | erreur de syntaxe |
| schema-drift-extra-column | lab | non | 2.0 | cause : symptôme ou mauvaise cause ; catégorie code ≠ data | Parquet schema mismatch |
| pub-mysqldump-lock-tables-privilege | public | oui | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | accès refusé pour l'utilisateur 'apache' sur la base 'cluster' à localhost |
| pub-borg-not-found-cron-path | public | non | 2.0 | cause : symptôme ou mauvaise cause ; action hors sujet | BORG non installé sur ce système |
| pub-certbot-timeout-aaaa-old-provider | public | oui | 2.3 | cause : symptôme ou mauvaise cause ; action hors sujet | délai de connexion dépassé, probablement problème de pare-feu |
| query-statement-timeout | lab | non | 2.7 | cause : symptôme ou mauvaise cause ; action hors sujet | délai de requête supérieur à la limite autorisée |
| pg-connection-refused | lab | oui | 3.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | connexion refusée au serveur db-primary.internal sur le port 5432 |
| oom-killer-137 | lab | oui | 3.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | memory limit reached |
| pub-weaviate-x509-legacy-cn | public | oui | 3.7 | cause : symptôme ou mauvaise cause ; preuve : ligne décisive non liée | certificat ou TLS |
| pub-pg-dump-version-mismatch-cron | public | oui | 4.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | server version mismatch |
| fork-cannot-allocate | lab | non | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | mémoire insuffisante |
| pub-gitlab-backup-pg-dump-mismatch | public | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | server version mismatch |
| pub-node-heap-oom-backup | public | oui | 5.0 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Allocation de mémoire insuffisante |
| python-keyerror | lab | non | 5.3 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | KeyError 'gross_amount_eur' lors de la récupération des données |
| unhandled-rejection-null-order | lab | non | 5.3 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | Unhandled promise rejection avec erreur TypeError |
| pub-certbot-timeout-firewall-restarted | public | oui | 5.3 | cause : symptôme ou mauvaise cause ; fausse cause sûre d'elle (−1) | délai de connexion dépassé, probablement dû à un problème de pare-feu |
| validation-null-ids | lab | non | 5.7 | cause : symptôme ou mauvaise cause ; preuve : ligne décisive non liée | erreurs de données non validées (NULL customer_id et order_total < 0) |
| route-unreachable-vpn | lab | non | 6.0 | action hors sujet ; catégorie dependency ≠ network | LDAP sync failed due to VPN tunnel to datacenter appearing down |
| stripe-rate-limit-429 | lab | oui | 6.3 | action hors sujet ; catégorie network ≠ dependency | rate limit exceeded |
| tls-cert-expired | lab | oui | 6.7 | action hors sujet ; catégorie unknown ≠ network | certificat a expiré |
| pg-too-many-connections | lab | oui | 7.0 | action hors sujet | connexions épuisées |
| econnreset-mid-transfer | lab | non | 7.7 | inventé : retry_count ; cause : symptôme ou mauvaise cause | read ECONNRESET |
| vendor-maintenance-503 | lab | non | 7.7 | action hors sujet ; catégorie unknown ≠ dependency | API est en ligne pour maintenance |
| http-client-timeout | lab | non | 8.0 | catégorie network ≠ timeout ; action hors sujet | curl: Operation timed out after 30000 milliseconds with 0 bytes received |
| pg-disk-full-wal | lab | oui | 9.0 | catégorie resources ≠ database | disque plein |
| dns-resolution-failure | lab | oui | 10.0 | — | DNS failure |
| inode-exhaustion | lab | oui | 10.0 | — | inodes exhausted |
| pub-aws-s3-sync-sso-expired | public | oui | 10.0 | — | SSO session expirée ou invalide |
