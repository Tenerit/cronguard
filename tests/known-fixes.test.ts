import { describe, it, expect } from 'vitest'
import { knownFix } from '../src/services/llm/known-fixes'
import { CASES } from '../eval/cases'
import { PUBLIC_CASES } from '../eval/public-cases'

// Une correction connue affichée sur la mauvaise panne fait plus de mal qu'aucune :
// chaque pack doit se déclencher sur sa panne, et sur AUCUNE autre fixture.
// Note : les packs ajoutés le 2026-11-07 couvrent des cas publics déjà vus ; leur précision
// sur ce jeu est donc dans l'échantillon (seules les mesures du modèle y restent hors échantillon).
const EXPECTED: Record<string, string | null> = {
  'pg-connection-refused':   'pg-connection-refused',
  'pg-too-many-connections': 'pg-too-many-connections',
  'mysql-deadlock':          'db-deadlock',
  'pg-disk-full-wal':        'pg-wal-full',
  'dns-resolution-failure':  'dns-resolution',
  'tls-cert-expired':        'tls-cert-expired',
  'oom-killer-137':          'oom-killed',
  'disk-full-enospc':        'disk-full',
  'inode-exhaustion':        'inodes-exhausted',
  'stripe-rate-limit-429':   'http-429',
  'pub-pg-dump-version-mismatch-cron':      'pg-dump-version-mismatch',
  'pub-gitlab-backup-pg-dump-mismatch':     'pg-dump-version-mismatch',
  'pub-certbot-timeout-aaaa-old-provider':  'acme-challenge-timeout',
  'pub-certbot-timeout-firewall-restarted': 'acme-challenge-timeout',
  'pub-mysqldump-lock-tables-privilege':    'mysql-lock-tables',
  'pub-velero-x509-unknown-authority':      'tls-unknown-ca',
  'pub-weaviate-x509-legacy-cn':            'tls-hostname-mismatch',
  'pub-aws-s3-sync-sso-expired':            'cloud-token-expired',
  'pub-s3-upload-expired-token':            'cloud-token-expired',
  'pub-node-heap-oom-backup':               'node-heap-oom',
}

// Messages standard des outils (forme documentée), un par pack ajouté, plus des voisins
// qui ne doivent PAS déclencher (même mot, autre panne).
const SAMPLES: Array<[string, string | null]> = [
  ['psql: error: connection to server at "db" (10.0.0.5), port 5432 failed: FATAL:  password authentication failed for user "backup"', 'pg-auth-failed'],
  ['FATAL:  no pg_hba.conf entry for host "10.0.0.9", user "etl", database "dw", no encryption', 'pg-auth-failed'],
  ["ERROR 1045 (28000): Access denied for user 'backup'@'localhost' (using password: YES)", 'mysql-access-denied'],
  ["mysqldump: Got error: 1045: Access denied for user 'root'@'localhost' (using password: YES) when trying to connect", 'mysql-access-denied'],
  ['/bin/sh: 1: node: not found', 'command-not-found'],
  ['bash: line 1: aws: command not found', 'command-not-found'],
  ['Traceback (most recent call last):\nModuleNotFoundError: No module named \'pandas\'', 'python-module-missing'],
  ['curl: (60) SSL certificate problem: unable to get local issuer certificate', 'tls-unknown-ca'],
  ['Error: self-signed certificate in certificate chain', 'tls-unknown-ca'],
  ["Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames", 'tls-hostname-mismatch'],
  ['An error occurred (ExpiredToken) when calling the PutObject operation: The provided token has expired.', 'cloud-token-expired'],
  ['rsync: [sender] send_files failed to open "/srv/a.db": Permission denied (13)\nrsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338)', 'rsync-partial-transfer'],
  ['tar: /var/lib/app/data.log: file changed as we read it', 'tar-file-changed'],
  ['backup@nas.internal: Permission denied (publickey,password).', 'ssh-publickey-denied'],
  ["Error: EMFILE: too many open files, open '/data/x.csv'", 'too-many-open-files'],
  ['OSError: [Errno 24] Too many open files', 'too-many-open-files'],
  // Voisins à ne pas confondre
  ['GET /api/orders/42 -> 404 Not Found', null],
  ['Error: not found: invoice 8812', null],
  ['401 Unauthorized: the provided authorization grant is invalid, expired, or revoked', null],
  ['Permission denied: /var/log/app.log', null],
  ['certificate has expired', 'tls-cert-expired'],   // expiré ≠ CA inconnue : le pack « expiré » passe avant
]

describe('corrections connues (packs)', () => {
  it.each([...CASES, ...PUBLIC_CASES].map(c => [c.name, c.logs] as const))('%s', (name, logs) => {
    expect(knownFix(logs)?.id ?? null).toBe(EXPECTED[name] ?? null)
  })

  it.each(SAMPLES)('%s', (logs, id) => {
    expect(knownFix(logs)?.id ?? null).toBe(id)
  })

  it('rien sans logs', () => {
    expect(knownFix('')).toBeNull()
  })

  it('chaque pack a une catégorie, un titre et au moins 2 étapes', () => {
    const all = [...CASES, ...PUBLIC_CASES].map(c => c.logs).concat(SAMPLES.map(s => s[0]))
    const seen = new Set<string>()
    for (const logs of all) {
      const f = knownFix(logs)
      if (!f || seen.has(f.id)) continue
      seen.add(f.id)
      expect(f.category).toBeTruthy()
      expect(f.title.length).toBeGreaterThan(5)
      expect(f.steps.length).toBeGreaterThanOrEqual(2)
    }
    expect(seen.size).toBe(25)   // tous les packs sont exercés par au moins un exemple
  })
})
