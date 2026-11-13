import { describe, it, expect } from 'vitest'
import { knownFix, KNOWN_FIX_COUNT } from '../src/services/llm/known-fixes'
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
  // Fiches du 2026-11-08 qui reconnaissent des scénarios labo (jeu de réglage) :
  'watchdog-sigkill':        'killed-by-timeout',
  'query-statement-timeout': 'pg-statement-timeout',
  'fork-cannot-allocate':    'fork-failed',
  'csv-encoding-garbage':    'utf8-decode',
  // Fiches génériques ajoutées d'après les échecs du labo (jeu de réglage) :
  'econnreset-mid-transfer':  'connection-reset',
  'route-unreachable-vpn':    'host-unreachable',
  'http-client-timeout':      'network-timeout',
  'api-key-revoked-401':      'http-401',
  'vendor-maintenance-503':   'http-503',
  'geocoding-quota-exceeded': 'api-quota',
}

// Messages standard des outils (forme documentée), un par pack ajouté, plus des voisins
// qui ne doivent PAS déclencher (même mot, autre panne).
const SAMPLES: Array<[string, string | null]> = [
  // Signaux décisifs qui masquaient une fiche générique (2026-11-10)
  ['./dump.sh: line 2: --file: command not found\n./dump.sh: line 3: --table: command not found', 'broken-line-continuation'],
  ['which: no searchd in (/usr/bin:/bin)\n./run.sh: line 8: --config: command not found', 'command-not-found'],   // une seule ligne : $(which x) vide (PATH), pas la continuation
  ["Enter password: mysqldump: Got error: 1045: Access denied for user 'u'@'localhost' (using password: NO) when trying to connect", 'mysql-password-not-passed'],
  ['No protocol specified\nCannot open display :0.0', 'x-auth-refused'],
  ["Error: Can't open display: :0", 'no-display'],   // sans « No protocol specified » : pas de session X
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
  // Fiches du 2026-11-08 : message standard de chaque outil
  ['tar: /home/u/a.tar: Cannot write: Disk quota exceeded', 'disk-quota'],
  ['cp: cannot create regular file \'/mnt/backup/x\': Read-only file system', 'read-only-fs'],
  ['Exception in thread "main" java.lang.OutOfMemoryError: Java heap space', 'java-heap'],
  ['PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes)', 'php-memory'],
  ['Traceback (most recent call last):\n  File "etl.py", line 12, in <module>\nMemoryError', 'python-memoryerror'],
  ['ERROR 1205 (HY000) at line 1: Lock wait timeout exceeded; try restarting transaction', 'db-lock-wait'],
  ['ERROR:  could not serialize access due to concurrent update', 'pg-serialization'],
  ['pg_dump: error: Dumping the contents of table "events" failed: PQgetResult() failed.\npg_dump: error: server closed the connection unexpectedly', 'pg-server-closed'],
  ['mysqldump: Error 2013: Lost connection to MySQL server during query when dumping table `logs`', 'mysql-gone-away'],
  ["ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2)", 'mysql-socket'],
  ['ERROR 1040 (HY000): Too many connections', 'mysql-too-many-connections'],
  ["mysqldump: Couldn't execute 'SELECT COLUMN_NAME FROM information_schema.COLUMN_STATISTICS': Unknown table 'COLUMN_STATISTICS' in information_schema (1109)", 'mysqldump-column-statistics'],
  // corpus de réglage (2026-11-13)
  ['2014-12-10 05:40:01 ERROR 403: Forbidden.', 'http-403'],
  ['/usr/bin/python can\'t open file "/abs/path/to/script.py": [Errno 2] No such file or directory', 'script-file-missing'],
  ['-bash: [1: command not found', 'bracket-no-space'],
  ['/bin/sh: 1: cannot create /dev/tcp/example.com/80: Directory nonexistent', 'dev-tcp-sh'],
  ["Error: couldn't get currently installed version for //.local/share/letsencrypt/bin/letsencrypt:", 'home-is-root'],
  ["error: tomcat6:7 unknown user 'tomcat6'", 'logrotate-unknown-user'],
  ['(CRON) ERROR chdir failed (/home/sysagent): No such file or directory', 'cron-home-chdir'],
  ['cron[3164]: (system) INSECURE MODE (group/other writable) (/etc/crontab)', 'crontab-insecure-mode'],
  ['The user curator cannot use this program (crontab)', 'cron-allow-denied'],
  ['sSMTP[6924]: Cannot open mailhub:25', 'ssmtp-mailhub'],
  ['Failed to start crond.service: Unit crond.service failed to load: No such file or directory.', 'no-cron-daemon'],
  // public8, moitié entraînement (2026-11-13)
  ["Error starting process '/var/task/selenium-manager': Exec format error", 'exec-format-error'],
  ['No input file specified.', 'php-no-input-file'],
  ['++ grep ERROR\n+ CRIT_ERRS=\n', 'set-e-grep-no-match'],
  ['/bin/bash: probe.bash: command not found', 'script-without-dot-slash'],
  ['error: error running non-shared postrotate script for /var/log/nginx/access.log', 'logrotate-postrotate'],
  ['mysqldump: Error: \'Access denied; you need (at least one of) the PROCESS privilege(s) for this operation\' when trying to dump tablespaces', 'mysqldump-process-privilege'],
  ['psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  Peer authentication failed for user "backup"', 'pg-peer-auth'],
  ['psql: error: FATAL:  role "root" does not exist', 'pg-role-missing'],
  ['pg_dump: error: query failed: ERROR:  permission denied for table invoices', 'pg-permission-denied'],
  ['sqlite3.OperationalError: database is locked', 'sqlite-locked'],
  ["/opt/jobs/backup.sh: line 2: $'\\r': command not found", 'crlf-line-endings'],
  ['/opt/jobs/sync.sh: 5: Syntax error: "(" unexpected', 'sh-not-bash'],
  ['/opt/jobs/sync.sh: 12: [[: not found', 'sh-not-bash'],
  ['/bin/sh: /opt/jobs/report.py: /usr/local/bin/python3.11: bad interpreter: No such file or directory', 'bad-interpreter'],
  ['the input device is not a TTY', 'not-a-tty'],
  ['Error: cannot open display: :0', 'no-display'],
  ["UnicodeEncodeError: 'ascii' codec can't encode character '\\xe9' in position 4: ordinal not in range(128)", 'ascii-locale'],
  ['TERM environment variable not set.', 'term-not-set'],
  ["Error: Cannot find module 'dotenv'\nRequire stack:\n- /home/app/job.js", 'node-module-missing'],
  ['/bin/sh: 1: /opt/jobs/rotate.sh: Permission denied', 'exec-permission-denied'],
  ["fatal: detected dubious ownership in repository at '/srv/site'", 'git-dubious-ownership'],
  ['@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.', 'ssh-host-key-changed'],
  ['Host key verification failed.\nrsync: connection unexpectedly closed (0 bytes received so far) [sender]', 'ssh-host-key-verification'],
  ['sign_and_send_pubkey: signing failed for RSA "/root/.ssh/id_rsa" from agent: agent refused operation', 'ssh-agent-missing'],
  ['ssh: connect to host backup.example.net port 22: Connection timed out', 'ssh-connect-timeout'],
  ['gpg: 0x1234ABCD: skipped: No public key\ngpg: [stdin]: encryption failed: No public key', 'gpg-no-key'],
  ['gpg: signing failed: Inappropriate ioctl for device', 'gpg-no-tty'],
  ['Fatal: wrong password or no key found', 'backup-repo-password'],
  ['unable to create lock in backend: repository is already locked by PID 4211 on host1 by root', 'stale-lock'],
  ['Failed to create/acquire the lock /backup/repo/lock.exclusive (timeout).', 'stale-lock'],
  ['An error occurred (RequestTimeTooSkewed) when calling the PutObject operation: The difference between the request time and the current time is too large.', 'clock-skew'],
  ['Problem binding to port 80: Could not bind to IPv4 or IPv6.', 'acme-port-busy'],
  ['Error creating new order :: too many certificates already issued for: example.com', 'acme-rate-limit'],
  ['Error: connect ECONNREFUSED 127.0.0.1:6379', 'connection-refused'],
  ['curl: (22) The requested URL returned error: 502 Bad Gateway', 'http-gateway'],
  ['Error response from daemon: toomanyrequests: You have reached your pull rate limit.', 'docker-pull-limit'],
  ['Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?', 'docker-daemon'],
  ['upload failed: ./x to s3://b/x Unable to locate credentials', 'cloud-no-credentials'],
  ['An error occurred (AccessDenied) when calling the PutObject operation: Access Denied', 'cloud-access-denied'],
  ['smtplib.SMTPAuthenticationError: (535, b\'5.7.8 Username and Password not accepted.\')', 'smtp-auth'],
  ['timeout: sending signal TERM to command \'pg_dump\'', 'killed-by-timeout'],
  ['/usr/bin/rm: Argument list too long', 'argument-list-too-long'],
  ['/opt/jobs/convert.sh: line 9:  4211 Segmentation fault      (core dumped) ./resize', 'segfault'],
  ["UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe9 in position 10: invalid continuation byte", 'utf8-decode'],
  ['SyntaxError: Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON', 'json-not-json'],
  ['file has vanished: "/var/log/app/x.log.1"\nrsync warning: some files vanished before they could be transferred (code 24) at main.c(1338)', 'rsync-vanished'],
  ['docker: Error response from daemon: no space left on device.', 'docker-no-space'],
  ['PHP Warning:  mysqli::__construct(): (HY000/2002): No such file or directory', 'mysql-socket-env'],
  ["mysqldump: Got error: 1045: Access denied for user 'u'@'localhost' (using password: NO) when trying to connect", 'mysql-no-password-sent'],
  ['WebDriverException: Message: unknown error: Chrome failed to start: exited abnormally', 'chrome-failed-start'],
  ['/usr/local/bin/redmine-email.sh: line 5: rake: command not found', 'command-not-found'],
  // Familles récurrentes ajoutées avant public5
  ["/bin/sh: -c: line 0: unexpected EOF while looking for matching `)'", 'crontab-percent'],
  ['"/tmp/crontab.Xk3/crontab":3: bad minute\nerrors in crontab file, can\'t install.', 'crontab-rejected'],
  ['/opt/jobs/run.sh: line 1: #!/bin/bash: No such file or directory', 'shebang-hidden-chars'],
  ["Traceback (most recent call last):\n  File \"job.py\", line 4, in <module>\n    token = os.environ['API_TOKEN']\nKeyError: 'API_TOKEN'", 'env-var-missing'],
  ['/opt/jobs/sync.sh: line 7: BACKUP_DIR: unbound variable', 'env-var-missing'],
  ['Exception in thread "main" java.lang.NoClassDefFoundError: org/apache/commons/io/FileUtils', 'java-classpath'],
  ["PHP Fatal error:  require(): Failed opening required '../config.php'", 'relative-path'],
  ["python3: can't open file 'report.py': [Errno 2] No such file or directory", 'relative-path'],
  ['/opt/jobs/etl.sh: line 3: venv/bin/activate: No such file or directory', 'venv-activate-missing'],
  ['fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights', 'git-remote-unreadable'],
  ['/home/deploy/cron/job.sh: 5: /home/deploy/cron/job.sh: gsutil: not found', 'command-not-found'],
  ['tee: /var/www/out.log: permission denied', 'permission-denied'],
  // Corpus de réglage StackExchange (2026-11-10)
  ['Jan  2 03:00:01 h CRON[874]: (root) CMD (expr `date +)', 'cron-cmd-truncated'],
  ['Jan  2 03:00:01 h cron[912]: Error: bad username; while reading /etc/crontab', 'crontab-bad-username'],
  ['/bin/sh: 1: ${BACKUP_HOME}/run.sh: No such file or directory', 'crontab-var-not-expanded'],
  ['/var/www/cron/update.php: line 1: ?php: No such file or directory', 'php-no-shebang'],
  ['Failed to restart nginx.service: Interactive authentication required.', 'systemd-interactive-auth'],
  ['crond[2211]: (backup) PAM ERROR (Authentication token is no longer valid; new one required)', 'pam-account-expired'],
  ['sudo: no tty present and no askpass program specified', 'sudo-no-tty'],
  ['find: Invalid range end', 'locale-regex-range'],
  ['java.lang.IllegalArgumentException: Cron expression must consist of 6 fields (found 5 in "0 2 * * *")', 'spring-cron-fields'],
  ['Error: cannot connect to X server :0', 'no-display'],
  // Voisins à ne pas confondre
  ["KeyError: 'total_amount'", null],                                   // clé de données, pas une variable d'environnement
  ["python3: can't open file '/opt/jobs/report.py': [Errno 2] No such file or directory", 'script-file-missing'],   // chemin absolu : pas « relatif » (fiche dédiée depuis le 13/11)
  ['GET /api/orders/42 -> 404 Not Found', null],
  ['Error: not found: invoice 8812', null],
  ['401 Unauthorized: the provided authorization grant is invalid, expired, or revoked', 'http-401'],   // pas « identifiants cloud expirés »
  ['Permission denied: /var/log/app.log', 'permission-denied'],   // générique, en dernier
  ['certificate has expired', 'tls-cert-expired'],   // expiré ≠ CA inconnue : le pack « expiré » passe avant
  ['x509: certificate has expired or is not yet valid', 'tls-cert-expired'],          // pas « horloge décalée »
  ['FATAL: JavaScript heap out of memory\nAborted (core dumped)', 'node-heap-oom'],   // pas « segfault »
  ['GET /api/orders/42 -> 504 Not Found in cache', null],
  ['the job printed: no tty needed here', null],
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
      expect(f.steps.length).toBeGreaterThanOrEqual(1)
      expect(f.cause.length).toBeGreaterThan(20)
      expect(f.action.length).toBeGreaterThan(15)
    }
    expect(seen.size).toBe(KNOWN_FIX_COUNT)   // tous les packs sont exercés par au moins un exemple
  })
})
