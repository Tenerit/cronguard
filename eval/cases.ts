/**
 * Eval set — 26 scénarios de pannes réelles de cron jobs.
 *
 * Chaque cas : logs bruts + catégorie attendue + sévérité attendue.
 * Les cas sont volontairement tranchés (une seule catégorie plausible)
 * pour que le score mesure le modèle, pas l'ambiguïté des fixtures.
 *
 * Usage : npx tsx eval/run.ts   (voir eval/run.ts pour les options)
 */
import type { ErrorCategory, Severity } from '../src/services/llm/analyzer'

export interface EvalCase {
  name:     string
  category: ErrorCategory
  severity: Severity
  exitCode: number
  logs:     string
  source?:  string                                   // URL publique (jeu --set public)
  facts?:   { cause: RegExp; action: RegExp }        // sinon FACTS[name] (quality.ts)
}

export const CASES: EvalCase[] = [

  // ── database ────────────────────────────────────────────────────────────────
  {
    name: 'pg-connection-refused', category: 'database', severity: 'high', exitCode: 1,
    logs: `psql: error: connection to server at "db-primary.internal" (10.2.0.11), port 5432 failed: Connection refused
	Is the server running on that host and accepting TCP/IP connections?
FATAL: backup job aborted — could not establish database connection after 3 attempts
exit code 1`,
  },
  {
    name: 'pg-too-many-connections', category: 'database', severity: 'high', exitCode: 1,
    logs: `ERROR: FATAL:  remaining connection slots are reserved for non-replication superuser connections
psycopg2.OperationalError: FATAL:  sorry, too many clients already
[ETL] Could not acquire connection from pool (max_connections=100, in use: 100)
[ETL] Aborting nightly aggregation — 0 rows processed`,
  },
  {
    name: 'mysql-deadlock', category: 'database', severity: 'medium', exitCode: 1,
    logs: `[02:00:14] Executing batch UPDATE on orders_archive...
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
[02:00:14] Transaction rolled back
[02:00:19] Retry 1/3... ERROR 1213 (40001): Deadlock found when trying to get lock
[02:00:24] Retry 2/3... ERROR 1213 (40001): Deadlock found when trying to get lock
[02:00:29] All retries exhausted, giving up. 0 / 48201 rows archived`,
  },
  {
    name: 'pg-disk-full-wal', category: 'database', severity: 'critical', exitCode: 1,
    logs: `pg_dump: error: query failed: ERROR: could not write to file "pg_wal/000000010000004400000071": No space left on device
PANIC:  could not write to file "pg_wal/xlogtemp.2847": No space left on device
server closed the connection unexpectedly
pg_dump: error: connection to server was lost
df -h /var/lib/postgresql: /dev/sda1  500G  500G  0  100% /var/lib/postgresql`,
  },

  // ── network ─────────────────────────────────────────────────────────────────
  {
    name: 'dns-resolution-failure', category: 'network', severity: 'high', exitCode: 6,
    logs: `curl: (6) Could not resolve host: api.partner-feeds.com
Fetching daily price feed... failed
getaddrinfo ENOTFOUND api.partner-feeds.com
    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:107:26)
All 3 DNS retries failed (resolv.conf: nameserver 10.0.0.2)
Feed sync aborted — using stale prices from yesterday`,
  },
  {
    name: 'tls-cert-expired', category: 'network', severity: 'high', exitCode: 1,
    logs: `Connecting to https://webhook.internal-billing.acme.corp ...
Error: certificate has expired
    at TLSSocket.emitRTCertError (node:_tls_wrap:908:8)
  code: 'CERT_HAS_EXPIRED',
  cert valid until: Jun  3 23:59:59 2026 GMT
Invoice push failed for 312 invoices — none delivered`,
  },
  {
    name: 'econnreset-mid-transfer', category: 'network', severity: 'medium', exitCode: 1,
    logs: `[INFO] Uploading nightly export to sftp://exports.partner.io (412 MB)
[INFO] Transferred 287 MB / 412 MB...
Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:217:20)
[ERROR] Connection reset by peer during transfer
[ERROR] Upload incomplete — partner will see truncated file if not retried`,
  },
  {
    name: 'route-unreachable-vpn', category: 'network', severity: 'high', exitCode: 1,
    logs: `[04:30:01] Syncing HR records to on-prem LDAP (10.50.8.21:636)
connect EHOSTUNREACH 10.50.8.21:636
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1716:16)
traceroute: 10.50.8.0/24 unreachable after hop 3 (vpn-gw-2.acme.corp)
[04:30:43] LDAP sync failed — VPN tunnel to datacenter appears down`,
  },

  // ── timeout ─────────────────────────────────────────────────────────────────
  {
    name: 'watchdog-sigkill', category: 'timeout', severity: 'high', exitCode: 124,
    logs: `[01:00:02] Generating sitemap for 1.2M URLs...
[01:42:11] Progress: 64% (chunk 770/1200)
[02:00:02] WARNING: job exceeded soft limit (3600s), sending SIGTERM
[02:00:32] Process did not exit, sending SIGKILL
timeout: sending signal KILL to command 'node build-sitemap.js'
Job killed after 3630s — sitemap NOT updated (last good: 2 days ago)`,
  },
  {
    name: 'http-client-timeout', category: 'timeout', severity: 'medium', exitCode: 28,
    logs: `Fetching exchange rates from https://rates.vendor.com/v2/daily ...
curl: (28) Operation timed out after 30000 milliseconds with 0 bytes received
Retry 1: curl: (28) Operation timed out after 30000 milliseconds with 0 bytes received
Retry 2: curl: (28) Operation timed out after 30001 milliseconds with 0 bytes received
Rates NOT refreshed — checkout will use rates from 2026-06-10 (24h old)`,
  },
  {
    name: 'query-statement-timeout', category: 'timeout', severity: 'medium', exitCode: 1,
    logs: `[REPORT] Running monthly revenue rollup query...
ERROR:  canceling statement due to statement timeout
CONTEXT: SQL statement "SELECT date_trunc('day', created_at), sum(amount_cents) FROM payments WHERE created_at >= $1 GROUP BY 1"
Query ran 120000ms (statement_timeout=120s) — table payments now 480M rows
Rollup aborted, dashboard will show stale figures`,
  },

  // ── resources ───────────────────────────────────────────────────────────────
  {
    name: 'oom-killer-137', category: 'resources', severity: 'critical', exitCode: 137,
    logs: `[03:00:01] Building ML feature matrix (14M rows × 240 features)...
[03:22:47] Loading chunk 9/12 into memory...
Killed
dmesg: Out of memory: Killed process 18472 (python3) total-vm:16234500kB, anon-rss:15782340kB
container exit code: 137 (OOMKilled), memory limit: 16Gi
Feature store NOT refreshed — models will score on yesterday's features`,
  },
  {
    name: 'disk-full-enospc', category: 'resources', severity: 'critical', exitCode: 1,
    logs: `[02:15:01] Writing compressed archive /backups/app-2026-06-11.tar.zst ...
tar: /backups/app-2026-06-11.tar.zst: Write error: No space left on device
ENOSPC: no space left on device, write
df -h /backups: /dev/sdb1  2.0T  2.0T  0 100% /backups
ls /backups | wc -l: 412 archives (oldest: 2024-09-01, no rotation configured)
Backup FAILED — last good backup is 26h old`,
  },
  {
    name: 'fork-cannot-allocate', category: 'resources', severity: 'high', exitCode: 1,
    logs: `[05:00:01] Spawning 8 parallel image-resize workers...
sh: fork: retry: Resource temporarily unavailable
sh: fork: Cannot allocate memory
[05:00:09] Only 2/8 workers started, aborting batch
free -m: total 7821, used 7790, available 31
Thumbnail generation failed for 18,420 images`,
  },
  {
    name: 'inode-exhaustion', category: 'resources', severity: 'high', exitCode: 1,
    logs: `[00:30:01] Extracting vendor catalog (940k small XML files)...
tar: catalog/items/8842711.xml: Cannot open: No space left on device
df -h /data: /dev/sdc1  1.0T  410G  590G  41% /data
df -i /data: /dev/sdc1  65536000  65536000  0  100% /data
Inodes exhausted — extraction failed at file 612,884 / 940,112`,
  },

  // ── dependency ──────────────────────────────────────────────────────────────
  {
    name: 'stripe-rate-limit-429', category: 'dependency', severity: 'medium', exitCode: 1,
    logs: `Fetching subscription updates from Stripe...
StripeRateLimitError: Request rate limit exceeded
  statusCode: 429, requestId: 'req_8mKx2LpW',
  headers: { 'retry-after': '17', 'x-ratelimit-remaining-requests': '0' }
Processed 0 / ~1900 subscriptions. Aborting hourly sync.`,
  },
  {
    name: 'api-key-revoked-401', category: 'dependency', severity: 'high', exitCode: 1,
    logs: `POST https://api.sendgrid.com/v3/mail/send
401 Unauthorized: {"errors":[{"message":"The provided authorization grant is invalid, expired, or revoked"}]}
All 4,812 transactional emails failed to send
NOTE: security team rotated all vendor API keys on 2026-06-10 (ticket SEC-2291)`,
  },
  {
    name: 'vendor-maintenance-503', category: 'dependency', severity: 'medium', exitCode: 1,
    logs: `Pulling shipment statuses from carrier API...
GET https://api.carrier-express.com/v1/shipments → 503 Service Unavailable
Response: {"error":"scheduled_maintenance","message":"API offline for maintenance until 06:00 UTC","retry_after":5400}
Retried 3× over 6 min, same response. Tracking page will show stale statuses.`,
  },
  {
    name: 'geocoding-quota-exceeded', category: 'dependency', severity: 'medium', exitCode: 1,
    logs: `Geocoding 2,340 new addresses via Maps API...
403 Forbidden: { "error": { "code": 403, "status": "RESOURCE_EXHAUSTED",
  "message": "Quota exceeded for quota metric 'Geocoding requests' and limit 'per day' of service 'geocoding.googleapis.com'" } }
Processed 0 / 2,340. Daily quota resets at midnight PT.`,
  },

  // ── code ────────────────────────────────────────────────────────────────────
  {
    name: 'typeerror-undefined-prop', category: 'code', severity: 'medium', exitCode: 1,
    logs: `[INFO] Building loyalty point statements for 8,114 members...
TypeError: Cannot read properties of undefined (reading 'tier')
    at computeBonus (/app/src/loyalty/bonus.js:71:31)
    at /app/src/loyalty/statement.js:44:19
    at Array.map (<anonymous>)
[ERROR] 0 / 8114 statements generated
NOTE: members table got new 'tier_v2' column in yesterday's deploy (PR #2241)`,
  },
  {
    name: 'python-keyerror', category: 'code', severity: 'medium', exitCode: 1,
    logs: `Traceback (most recent call last):
  File "/opt/jobs/reconcile_payments.py", line 188, in <module>
    main()
  File "/opt/jobs/reconcile_payments.py", line 94, in main
    amount = row["gross_amount_eur"]
KeyError: 'gross_amount_eur'
Upstream CSV columns: ['gross_amount', 'currency', 'fee', 'net']
Reconciliation aborted — 0 transactions matched`,
  },
  {
    name: 'syntax-error-bad-deploy', category: 'code', severity: 'high', exitCode: 1,
    logs: `/app/dist/jobs/rotate-logs.js:12
const retention = config.days ?? ;
                              ^^
SyntaxError: Unexpected token ';'
    at internalCompileFunction (node:internal/vm:73:18)
Deployed 22 min ago by CI run #8841 (commit f3c2a91 "quick fix retention")
Job crashed at startup — log rotation did not run`,
  },
  {
    name: 'unhandled-rejection-null-order', category: 'code', severity: 'medium', exitCode: 1,
    logs: `[INFO] Emailing 96 abandoned-cart reminders...
[ERROR] Unhandled promise rejection
TypeError: Cannot destructure property 'items' of 'order' as it is null.
    at buildReminderEmail (/app/src/marketing/cart.js:58:9)
    at async Promise.all (index 23)
Sent 23/96 before crash; remaining 73 carts never reminded`,
  },

  // ── data ────────────────────────────────────────────────────────────────────
  {
    name: 'validation-null-ids', category: 'data', severity: 'critical', exitCode: 1,
    logs: `[06:00:12] Validating daily customer batch (s3://lake/daily/2026-06-11/, 1,204,331 records)
[ERROR] 84,112 records with NULL customer_id (expected 0)
[ERROR] 3,402 records with order_total < 0
[CRITICAL] Quality score 91.2% below threshold 99.5% — batch QUARANTINED
0 records written to warehouse; downstream marts will miss a full day`,
  },
  {
    name: 'csv-encoding-garbage', category: 'data', severity: 'high', exitCode: 1,
    logs: `Importing supplier price list (supplier_FTP/prices_20260611.csv)...
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 0: invalid start byte
File appears to be UTF-16LE with BOM (first bytes: ff fe 50 00)
Parsed 0 / expected ~45,000 price rows
Yesterday's file was valid UTF-8 — supplier likely changed export tool`,
  },
  {
    name: 'schema-drift-extra-column', category: 'data', severity: 'high', exitCode: 1,
    logs: `[ETL] Loading events_export.parquet into warehouse.events ...
Error: Parquet schema mismatch: source has 14 columns, target table has 13
New column in source: 'consent_flags' (BYTE_ARRAY) at position 9
COPY aborted — 0 / 9,442,801 events loaded
Producer team shipped tracking-consent v2 yesterday (changelog #418)`,
  },
]
