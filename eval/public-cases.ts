// Jeu HORS ÉCHANTILLON : vraies pannes publiques (issues, forums, listes de diffusion).
// Logs recopiés tels quels depuis la source, cause = celle établie dans le fil (mainteneur,
// répondant, ou rapporteur après correction). Étiquettes figées le 2026-11-07 AVANT tout
// passage du modèle, et rien dans CronGuard n'a été réglé sur ces cas ensuite.
//
// Limites, à dire avec chaque chiffre : 11 cas seulement (intervalle large), sélection par
// recherche web (biais vers les erreurs bien documentées), et plusieurs logs portent déjà
// la cause en clair (« certificate signed by unknown authority »), ce qui facilite la tâche.
// Aucun cas ne relève des packs « disque plein / OOM 137 / WAL » : ils ne sont pas mesurés ici.

import type { EvalCase } from './cases'

export const PUBLIC_CASES: EvalCase[] = [
  {
    name: 'pub-pg-dump-version-mismatch-cron', category: 'database', severity: 'medium', exitCode: 1,
    source: 'https://www.postgresql.org/message-id/4FAD6AE6.6000904@gmail.com',
    logs: `Plain backup of mitesh
pg_dump: server version: 9.1.2; pg_dump version: 9.0.5
pg_dump: aborting because of server version mismatch`,
    facts: { cause: /version|mismatch|incompatib|9\.0|9\.1|ancienne|older|plus ancien/i,
             action: /pg_dump|chemin|path|version|mettre à jour|upgrade|install/i },
  },
  {
    name: 'pub-gitlab-backup-pg-dump-mismatch', category: 'database', severity: 'medium', exitCode: 1,
    source: 'https://gitlab.com/gitlab-org/charts/gitlab/-/issues/2254',
    logs: `Error 2020-08-16 09:19:59.154 CEST /srv/gitlab/bin/bundle:3:in \`<main>'
Error 2020-08-16 09:19:59.154 CEST /srv/gitlab/bin/bundle:3:in \`load'
Error 2020-08-16 09:19:59.154 CEST /srv/gitlab/vendor/bundle/ruby/2.6.0/gems/rake-12.3.3/exe/rake:27:in \`<top (required)>'
Error 2020-08-16 09:19:59.154 CEST /srv/gitlab/lib/tasks/gitlab/backup.rake:118:in \`block (4 levels) in <top (required)>'
Error 2020-08-16 09:19:59.154 CEST /srv/gitlab/lib/backup/database.rb:45:in \`dump'
Error 2020-08-16 09:19:59.154 CEST Backup::Error: Backup failed
Error 2020-08-16 09:19:59.154 CEST rake aborted!
Error 2020-08-16 09:19:59.153 CEST pg_dump: aborting because of server version mismatch`,
    facts: { cause: /version|mismatch|incompatib/i,
             action: /pg_dump|version|upgrade|mettre à jour|client|install/i },
  },
  {
    name: 'pub-certbot-timeout-aaaa-old-provider', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://community.letsencrypt.org/t/timeout-during-connect-likely-firewall-problem-after-changing-internet-provider/170862',
    logs: `Domain: fotografeer.nl
Type: connection
Detail: Fetching
https://fotografeer.nl/.well-known/acme-challenge/ZmgPRKVEux58yHUvInkBA-zly0nDC_B9hNDRLidyg2w:
Timeout during connect (likely firewall problem)`,
    facts: { cause: /firewall|pare-feu|bloqu|port|connect|joign|accessib|dns|ipv6|aaaa/i,
             action: /firewall|pare-feu|port|dns|ouvr|aaaa|ipv6/i },
  },
  {
    name: 'pub-certbot-timeout-firewall-restarted', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://community.letsencrypt.org/t/certbot-renewal-timeout/83286',
    logs: `Domain: devolved.noip.me
Type: connection
Detail: Fetching
http://devolved.noip.me/.well-known/acme-challenge/8o8clQ5P8WoqkT1OaxBk4mPcu7HuhAKi7KR8mX3Sk8M:
Timeout during connect (likely firewall problem)`,
    facts: { cause: /firewall|pare-feu|bloqu|port|connect|joign|accessib/i,
             action: /firewall|pare-feu|port|ouvr|règle|rule/i },
  },
  {
    name: 'pub-mysqldump-lock-tables-privilege', category: 'database', severity: 'medium', exitCode: 2,
    source: 'https://www.ibm.com/support/pages/mysqldump-error-1044',
    logs: `/etc/cron.daily/backup-cluster-db:
mysqldump: Got error: 1044: Access denied for user 'apache'@'localhost' to database 'cluster' when using LOCK TABLES`,
    facts: { cause: /lock|privil|droit|permission|grant|accès refusé|access denied/i,
             action: /grant|privil|droit|single-transaction|lock/i },
  },
  {
    name: 'pub-velero-x509-unknown-authority', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://github.com/vmware-tanzu/velero/issues/2675',
    logs: `An error occurred: some backup storage locations are invalid: backup store for location "default" is invalid: rpc error: code = Unknown desc = RequestError: send request failed
caused by: Get https://s3.er.abc.com:10443/velero?delimiter=%2F&list-type=2&prefix=abc-lab09%2F: x509: certificate signed by unknown authority`,
    facts: { cause: /certif|autorit|authority|x509|\bca\b|confiance|trust/i,
             action: /\bca\b|certif|cacert|trust|confiance|bundle/i },
  },
  {
    name: 'pub-borg-not-found-cron-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://github.com/asifbacchus/mailcowbackup/issues/10',
    logs: `ERROR: BORG is not installed on this system!`,
    facts: { cause: /path|introuvable|not installed|non install|absent|manquant|missing|borg/i,
             action: /path|chemin|install|borg/i },
  },
  {
    name: 'pub-weaviate-x509-legacy-cn', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://forum.weaviate.io/t/s3-backup-failed-to-verify-certificate/5841',
    logs: `{"error":[{"message":"check if backup \\"test-backup\\" exists at \\"s3://[…internal_bucketname…]/test-backup\\": get object 'test-backup/backup_config.json': Get \\"https://[…internal_host_fqdn…]:8443/[…internal_bucketname…]/?location=\\": tls: failed to verify certificate: x509: certificate relies on legacy Common Name field, use SANs instead"}]}`,
    facts: { cause: /\bsans?\b|subject alt|common name|\bcn\b|legacy/i,
             action: /\bsans?\b|subject alt|certif|régénér|regener|ssl_cert_file|truststore/i },
  },
  {
    name: 'pub-aws-s3-sync-sso-expired', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://github.com/aws/aws-cli/issues/4863',
    logs: `upload: ../docs/file1.txt to s3://example.bucket/backups/file1.txt
upload failed: ../docs/file2.txt to s3://example.bucket/backups/file2.txt The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws2 sso login with the corresponding profile.
upload failed: ../docs/file3.txt to s3://example.bucket/backups/file3.txt The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws2 sso login with the corresponding profile.
upload failed: ../docs/file4.txt to s3://example.bucket/backups/file4.txt The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws2 sso login with the corresponding profile.`,
    facts: { cause: /sso|session|expir/i,
             action: /sso login|login|reconnect|renouvel|refresh|rafraîch|credential|identifiant/i },
  },
  {
    name: 'pub-s3-upload-expired-token', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://github.com/secureCodeBox/secureCodeBox/issues/2255',
    logs: `2024/02/01 06:10:12 File upload returned non 2xx status code (400)
2024/02/01 06:10:12 Failed Request:
2024/02/01 06:10:12 HTTP/1.1 400 Bad Request
Server: AmazonS3
<Error><Code>ExpiredToken</Code><Message>The provided token has expired.</Message>`,
    facts: { cause: /expir|token|jeton/i,
             action: /token|jeton|credential|refresh|renouvel|rafraîch|durée|duration/i },
  },
  {
    name: 'pub-node-heap-oom-backup', category: 'resources', severity: 'medium', exitCode: 134,
    source: 'https://xcp-ng.org/forum/post/102467',
    logs: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`,
    facts: { cause: /heap|mémoire|memory|\btas\b/i,
             action: /max-old-space-size|heap|mémoire|memory|\bram\b/i },
  },
]
