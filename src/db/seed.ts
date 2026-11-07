/**
 * Seed de développement — CronGuard
 *
 * Génère 8 monitors avec des scenarios d'erreur réalistes couvrant
 * chacune des 7 catégories LLM : database, network, timeout, resources,
 * dependency, code, data. Chaque echec a des logs réels pour tester
 * la qualité de l'analyse IA.
 */
import 'dotenv/config'
import * as crypto from 'crypto'
import { db }            from './index'
import { runMigrations } from './migrations'
import { logger }        from '../config/logger'
import * as fs           from 'fs'

// SEED_API_KEY: clé fixe pour la démo docker (README la documente) — sinon aléatoire
const DEMO_API_KEY = process.env.SEED_API_KEY || 'cg_demo_' + Math.random().toString(36).slice(2, 18)
const DEMO_EMAIL   = 'demo@cronguard.local'

// ─── Scénarios d'erreur réalistes ─────────────────────────────────────────────
// Chaque scénario inclut les logs exacts qu'on enverrait au LLM

// cause, action, prevention, checks, category, severity, confidence, data_impact, fix_minutes : sorties réelles
// de llama3.2:3b sur ces logs, non retouchées, un seul passage (2026-11-07). Ne pas les réécrire à la main.
const ERROR_SCENARIOS: Record<string, {
  category:    string
  severity:    string
  exit_code:   number
  logs:        string
  cause:       string
  action:      string
  prevention:  string
  checks:      string[]
  confidence:  string
  data_impact: string
  fix_minutes: number
}> = {

  // Scénario vitrine (GIF/démo) : panne lisible en 2s par n'importe quel dev.
  // Le plus frais du seed → apparaît en tête du dashboard.
  'backup-disk-full': {
    category: 'resources', severity: 'critical', exit_code: 1,
    logs: `[02:30:01] Starting nightly backup → /backups/db-2026-06-12.tar.zst
[02:30:01] Dumping database (12.4 GB)...
[02:31:47] Compressing archive...
tar: /backups/db-2026-06-12.tar.zst: Write error: No space left on device
ENOSPC: no space left on device, write
df -h /backups: /dev/sdb1  2.0T  2.0T  0 100% /backups
ls /backups | wc -l: 397 archives (oldest: 2024-11-03 — no rotation configured)
BACKUP FAILED — last good backup is 26h old`,
    cause: "disque plein",
    action: "Augmenter la taille du disque ou déplacer le job de backup vers un disque plus grand",
    prevention: "Vérifier régulièrement l'espace disponible sur les disques et ajuster les tailles en conséquence",
    checks: ["Vérifier l'espace disponible sur les disques","Vérifier si le job peut être déplacé vers un disque plus grand"],
    confidence: 'high',
    data_impact: 'confirmed', fix_minutes: 30,
  },

  'backup-postgres': {
    category: 'database', severity: 'medium', exit_code: 1,
    logs: `pg_dump: error: query failed: ERROR:  canceling statement due to conflict with recovery
pg_dump: error: query was: LOCK TABLE public.events IN ACCESS SHARE MODE
DETAIL: User query might have needed to see row versions that must be removed.
HINT: Consider increasing max_standby_streaming_delay and max_standby_archive_delay.
pg_dump: error: query failed: ERROR:  canceling statement due to conflict with recovery
pg_dump: error: query was: LOCK TABLE public.orders IN ACCESS SHARE MODE
pg_dump[6234]: [archiver (db)] Error while FINALIZING:
    Error message from server: ERROR:  canceling statement due to conflict with recovery
pg_dump: error: dump process failed: exit code 1`,
    cause: "conflict with recovery",
    action: "Vérifier et supprimer le lock sur la table events",
    prevention: "Utiliser LOCK TABLE public.events IN EXCLUSIVE MODE pour éviter les conflits avec la récupération",
    checks: ["Vérifier l'état de la table events","Supprimer le lock si présent"],
    confidence: 'high',
    data_impact: 'none', fix_minutes: 15,
  },

  'etl-analytics': {
    category: 'database', severity: 'high', exit_code: 1,
    logs: `Connecting to analytics warehouse...
ConnectionError: connect ECONNREFUSED 10.0.1.45:5439
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1716:16) {
  errno: -4078,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '10.0.1.45',
  port: 5439
}
Retrying connection (attempt 2/3)...
ConnectionError: connect ECONNREFUSED 10.0.1.45:5439
Retrying connection (attempt 3/3)...
ConnectionError: connect ECONNREFUSED 10.0.1.45:5439
FATAL: All retry attempts exhausted. ETL pipeline aborted.
Records processed: 0 / 847392`,
    cause: "connexion refusée au serveur PostgreSQL",
    action: "reessayer la connexion avec un autre compte utilisateur ou vérifier le mot de passe",
    prevention: "Vérifier que le compte utilisateur utilisé pour la connexion est correct et mis à jour",
    checks: ["Vérifier l'état du service PostgreSQL","Rechercher des erreurs connues dans les logs"],
    confidence: 'medium',
    data_impact: 'confirmed', fix_minutes: 30,
  },

  'sync-stripe-invoices': {
    category: 'network', severity: 'high', exit_code: 1,
    logs: `Fetching invoices from Stripe API...
StripeRateLimitError: Too Many Requests
  at processResponse (/app/node_modules/stripe/lib/StripeResource.js:156:15)
  at /app/node_modules/stripe/lib/StripeResource.js:215:9
  {
    type: 'StripeRateLimitError',
    headers: {
      'retry-after': '29',
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '0',
      'x-ratelimit-reset-requests': '1704067229',
    },
    statusCode: 429,
    requestId: 'req_Xk9mLpQrTs3vWx',
  }
Processed: 0 / ~2400 invoices
Aborting.`,
    cause: "Too Many Requests",
    action: "Réessayer la requête avec un retard de 30 secondes entre les essais",
    prevention: "Vérifier et ajuster le nombre de requêtes par minute pour éviter les erreurs de rate limiting",
    checks: ["Vérifier l'état des connexions Stripe","Vérifier la fréquence des requêtes Stripe"],
    confidence: 'medium',
    data_impact: 'none', fix_minutes: 15,
  },

  'cleanup-sessions': {
    category: 'database', severity: 'medium', exit_code: 1,
    logs: `[2024-01-15 02:00:01] Starting session cleanup...
[2024-01-15 02:00:01] Acquiring table lock...
[2024-01-15 02:04:23] ERROR: deadlock detected
DETAIL: Process 47832 waits for ShareLock on transaction 8847291; blocked by process 47831.
        Process 47831 waits for ShareLock on transaction 8847290; blocked by process 47832.
HINT: See server log for query details.
CONTEXT: while updating tuple (0,43) in relation "user_sessions"
[2024-01-15 02:04:23] Rolling back transaction...
[2024-01-15 02:04:23] Retry 1/3 in 5s...
[2024-01-15 02:04:28] ERROR: deadlock detected
[2024-01-15 02:04:28] All retries exhausted. 0 sessions cleaned.`,
    cause: "deadlock detected",
    action: "redémarrer le service et vérifier la configuration de synchronisation des blocs",
    prevention: "Vérifier régulièrement les logs de deadlock pour détecter les problèmes de synchronisation des blocs",
    checks: ["Vérifier que les clés de bloc sont correctement générées","Vérifier que les transactions sont bien synchronisées"],
    confidence: 'high',
    data_impact: 'none', fix_minutes: 30,
  },

  'send-weekly-digest': {
    category: 'code', severity: 'medium', exit_code: 1,
    logs: `[INFO] Loading user preferences...
[INFO] Fetching 1247 active subscriptions
[INFO] Building personalized content...
[ERROR] TypeError: Cannot read properties of undefined (reading 'email')
    at buildDigest (/app/src/services/digest.js:134:28)
    at async Promise.all (index 5)
    at processSubscriptions (/app/src/services/digest.js:89:5)
    at main (/app/src/index.js:23:3)
[ERROR] Unhandled rejection: TypeError: Cannot read properties of undefined (reading 'email')
[INFO] 0 / 1247 digests sent
[INFO] Failed users logged to /tmp/failed_users_1705276800.json`,
    cause: "erreur de type TypeError : propriété 'email' non définie",
    action: "Vérifier la configuration des données d'email et les types de données utilisés pour éviter ces erreurs futures",
    prevention: "Vérifier systématiquement que toutes les propriétés accessibles dans les données sont bien définies et valides",
    checks: ["Vérifier l'état du service de messagerie","Vérifier la configuration des types de données utilisés"],
    confidence: 'medium',
    data_impact: 'none', fix_minutes: 15,
  },

  'reindex-search': {
    category: 'resources', severity: 'critical', exit_code: 137,
    logs: `[04:00:01] Starting Elasticsearch reindex: products (2.4M documents)
[04:00:01] Source: es-prod-01:9200/products_v12
[04:00:01] Target: es-prod-01:9200/products_v13
[04:00:01] Batch size: 1000 docs/req
[04:12:34] Progress: 847,000 / 2,400,000 (35%)
[04:15:01] Progress: 923,000 / 2,400,000 (38%)
[04:15:03] Process killed by OOM killer (exit code 137)
Killed
dmesg: [1234567.89] Out of memory: Killed process 23847 (node) total-vm:4892840kB, anon-rss:3891232kB
Last log: oom_score_adj:0`,
    cause: "mémoire insuffisante",
    action: "Augmenter la mémoire allouée au processus ou redéployer avec plus de RAM",
    prevention: "Vérifier et ajuster les paramètres de mémoire pour éviter les OOM dans le futur",
    checks: ["Vérifier l'état des ressources système","Vérifier la configuration de mémoire du processus"],
    confidence: 'high',
    data_impact: 'confirmed', fix_minutes: 15,
  },

  'export-reports': {
    category: 'timeout', severity: 'high', exit_code: 124,
    logs: `[INFO] Starting monthly report export for 384 clients
[INFO] Generating PDF reports...
[INFO] Progress: 47/384 reports generated (ETA: ~28 min)
[INFO] Progress: 89/384 reports generated (ETA: ~31 min)
[INFO] Progress: 134/384 reports generated (ETA: ~35 min)
[WARNING] Memory usage: 78% (6.2 GB / 8 GB)
[INFO] Progress: 178/384 reports generated (ETA: ~38 min)
[WARNING] Memory usage: 89% (7.1 GB / 8 GB)
[INFO] Progress: 201/384 reports generated
Timeout: job exceeded 3600s grace period
Process killed by watchdog (SIGTERM → SIGKILL)
Generated: 201/384 reports — INCOMPLETE`,
    cause: "délai de grâce dépassé",
    action: "Réinitialiser le watchdog et redémarrer le job",
    prevention: "Vérifier la durée de fonctionnement du job et ajuster la grace period si nécessaire",
    checks: ["Vérifier l'état du service","Vérifier les logs de watchdog"],
    confidence: 'medium',
    data_impact: 'none', fix_minutes: 15,
  },

  'validate-data-pipeline': {
    category: 'data', severity: 'critical', exit_code: 1,
    logs: `[INFO] Starting data validation pipeline v2.3
[INFO] Source: data-lake s3://prod-datalake/daily/2024-01-15/
[INFO] Checking 847,392 records...
[ERROR] Validation failed: 23,847 records with NULL customer_id (expected 0)
[ERROR] Validation failed: 1,204 records with invalid email format
[ERROR] Validation failed: 847 records with future timestamps (> NOW())
[ERROR] Validation failed: price_usd contains negative values (min: -99.99)
[CRITICAL] Data quality score: 29.7% (below threshold: 95%)
[CRITICAL] Pipeline aborted — corrupted data would propagate to downstream systems
[INFO] Quarantine: 24,051 records moved to s3://prod-datalake/quarantine/2024-01-15/
[INFO] 0 records written to production tables`,
    cause: "23,847 records with NULL customer_id et 1,204 records avec format d'email incorrect",
    action: "Vérifier la source des données pour garantir l'intégrité du pipeline de validation",
    prevention: "Assurer que les données provenant de sources externes sont correctement formatées et complètes avant de passer en validation",
    checks: ["Vérifier les logs de la source de données","Vérifier les formats d'email utilisés dans le pipeline"],
    confidence: 'high',
    data_impact: 'confirmed', fix_minutes: 120,
  },
}

// ─── Monitors de démo ──────────────────────────────────────────────────────────

const MONITORS = [
  { name: 'backup-disk-full',      env: 'production',  schedule: '30 2 * * *',   grace: 600,  emin: null,  emax: null,   failAt: [0] },
  { name: 'backup-postgres',       env: 'production',  schedule: '0 2 * * *',    grace: 300,  emin: 1000,  emax: 100000, failAt: [0] },
  { name: 'etl-analytics',         env: 'production',  schedule: '0 1 * * *',    grace: 600,  emin: 100000,emax: 5000000,failAt: [0, 3] },
  { name: 'sync-stripe-invoices',  env: 'production',  schedule: '0 * * * *',    grace: 120,  emin: null,  emax: null,   failAt: [0] },
  { name: 'cleanup-sessions',      env: 'production',  schedule: '*/5 * * * *',  grace: 60,   emin: null,  emax: null,   failAt: [0, 7] },
  { name: 'send-weekly-digest',    env: 'production',  schedule: '0 9 * * 1',    grace: 600,  emin: 100,   emax: 50000,  failAt: [0] },
  { name: 'reindex-search',        env: 'production',  schedule: '0 4 * * *',    grace: 900,  emin: null,  emax: null,   failAt: [0] },
  { name: 'export-reports',        env: 'staging',     schedule: '0 1 1 * *',    grace: 3600, emin: 100,   emax: 1000,   failAt: [0] },
  { name: 'validate-data-pipeline',env: 'production',  schedule: '0 6 * * *',    grace: 600,  emin: 800000,emax:10000000,failAt: [0] },
]

// ─── Génération de données réalistes ──────────────────────────────────────────

function generateDuration(base: number, run: number, scenario: string): number {
  // Certains jobs se dégradent progressivement
  const degrading = ['export-reports', 'reindex-search']
  if (degrading.includes(scenario) && run < 5) {
    return base * (1 + (5 - run) * 0.15) | 0
  }
  return (base * (0.85 + Math.random() * 0.3)) | 0
}

function generateRecords(emin: number | null, emax: number | null, isFailure: boolean): number | null {
  if (emin === null) return null
  if (isFailure) return 0
  const range = (emax ?? emin * 10) - emin
  return (emin + Math.random() * range * 0.8) | 0
}

async function seed() {
  logger.info('[Seed] Starting...')
  await runMigrations()

  await db.query(`DELETE FROM clients WHERE email = $1`, [DEMO_EMAIL])

  const { rows: [client] } = await db.query(`
    INSERT INTO clients (email, api_key, plan)
    VALUES ($1, $2, 'pro')
    RETURNING id, api_key
  `, [DEMO_EMAIL, DEMO_API_KEY])

  logger.info('[Seed] Client created', { email: DEMO_EMAIL })

  const createdMonitors: Array<{ id: string; ping_key: string; name: string; failAt: number[] }> = []

  for (const m of MONITORS) {
    const { rows: [mon] } = await db.query(`
      INSERT INTO monitors (client_id, name, env, schedule, grace_period, expected_min, expected_max)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, ping_key, name
    `, [client.id, m.name, m.env, m.schedule, m.grace, m.emin, m.emax])
    createdMonitors.push({ ...mon, failAt: m.failAt })
  }

  logger.info('[Seed] Generating ping history with realistic error scenarios...')
  const now = Date.now()

  for (const mon of createdMonitors) {
    const isFrequent  = mon.name.includes('*/5') || mon.name.includes('*/15')
    const pingCount   = isFrequent ? 48 : 14
    const intervalMs  = isFrequent ? 5 * 60000 : 24 * 60 * 60000 / 2
    const baseDur     = 1000 + Math.random() * 8000 | 0
    const scenario    = ERROR_SCENARIOS[mon.name]
    const monDef      = MONITORS.find(m => m.name === mon.name)!

    // Génère les pings avec dégradation progressive pour certains
    const pingRows: Array<[string,string,number|null,number|null,number,string|null,Date]> = []

    for (let i = pingCount; i >= 0; i--) {
      const isFailure = mon.failAt.includes(i)
      const dur = isFailure ? null : generateDuration(baseDur, i, mon.name)
      const rec = isFailure ? null : generateRecords(monDef.emin, monDef.emax, false)

      pingRows.push([
        mon.id,
        isFailure ? 'failed' : 'success',
        dur,
        rec,
        isFailure ? scenario?.exit_code ?? 1 : 0,
        isFailure && scenario ? scenario.logs : null,
        new Date(now - i * intervalMs),
      ])
    }

    const placeholders = pingRows.map((_, i) =>
      `($${i*7+1},$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7})`
    ).join(',')

    const { rows: insertedPings } = await db.query(
      `INSERT INTO pings (monitor_id,status,duration_ms,records,exit_code,output,pinged_at)
       VALUES ${placeholders} RETURNING id, status, pinged_at, output`,
      pingRows.flat()
    )

    // Analyses enrichies pour chaque échec
    const failedPings = insertedPings.filter((p: {status: string}) => p.status === 'failed')

    for (const fp of failedPings) {
      if (!scenario) continue
      const errHash = crypto.createHash('md5').update(mon.name + scenario.logs.slice(0, 100)).digest('hex')

      await db.query(`
        INSERT INTO analyses
          (monitor_id, ping_id, error_hash, diagnosis, model_used, alert_type,
           severity, from_cache, category, prevention, confidence,
           checks, data_impact, fix_minutes, tokens_in, tokens_out, cause, action)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [
        mon.id,
        fp.id,
        errHash,
        JSON.stringify({
          cause:       scenario.cause,
          action:      scenario.action,
          prevention:  scenario.prevention,
          category:    scenario.category,
        }),
        'llama3.2:3b',
        'fail',
        scenario.severity,
        false,
        scenario.category,
        scenario.prevention,
        scenario.confidence,
        JSON.stringify(scenario.checks),
        scenario.data_impact,
        scenario.fix_minutes,
        320 + Math.random() * 80 | 0,
        80 + Math.random() * 40 | 0,
        scenario.cause, scenario.action,
      ])
    }

    // Incidents résolus (historique MTTR/impact) pour les jobs ayant échoué.
    // 2 jobs récurrents pour peupler la section "récurrents" du bandeau impact.
    if (scenario && failedPings.length) {
      const nIncidents = ['sync-stripe-invoices', 'cleanup-sessions'].includes(mon.name) ? 3 : 1
      for (let k = 0; k < nIncidents; k++) {
        const startedAt  = new Date(now - (Math.random() * 28 + 1) * 86400000)
        const durationMs = Math.round((5 + Math.random() * 175) * 60000)  // 5min → 3h
        const resolvedAt = new Date(startedAt.getTime() + durationMs)
        await db.query(`
          INSERT INTO incidents (monitor_id, started_at, resolved_at, duration_ms,
            alert_count, severity, category, data_impact, root_cause)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [mon.id, startedAt, resolvedAt, durationMs, 1 + (Math.random() * 3 | 0),
            scenario.severity, scenario.category, scenario.data_impact, scenario.cause])
      }
    }

    const lastStatus = mon.failAt.includes(0) ? 'failed'
                     : mon.name === 'sync-stripe-invoices' ? 'late' : 'ok'
    // Le scénario vitrine est le plus récent → en tête du dashboard pour la démo
    const pingAge = mon.name === 'backup-disk-full' ? 30_000 : 2 * 60000
    await db.query(
      `UPDATE monitors SET last_ping_at=$2, last_status=$3 WHERE id=$1`,
      [mon.id, new Date(now - pingAge), lastStatus]
    )
  }

  const firstMon = createdMonitors[0]
  try {
    fs.writeFileSync('.env.seed', [
      `# Généré par npm run seed`,
      `DEMO_API_KEY=${DEMO_API_KEY}`,
      `DEMO_PING_KEY=${firstMon.ping_key}`,
      `DEMO_MONITOR=${firstMon.name}`,
    ].join('\n'))
  } catch {
    // FS read-only (container démo) — les infos sont affichées dans les logs
  }

  logger.info('[Seed] Done!')
  console.log('\n' + '─'.repeat(60))
  console.log(`  ✓ Compte démo créé — ${MONITORS.length} monitors, ${Object.keys(ERROR_SCENARIOS).length} scénarios d'erreur`)
  console.log(`\n  Email    : ${DEMO_EMAIL}`)
  console.log(`  API Key  : ${DEMO_API_KEY}`)
  console.log(`  Ping Key : ${firstMon.ping_key}  (${firstMon.name})`)
  console.log('\n  Scénarios d\'erreur disponibles :')
  Object.entries(ERROR_SCENARIOS).forEach(([name, s]) => {
    console.log(`    ${s.category.padEnd(12)} ${name}`)
  })
  console.log(`\n  Dashboard : http://localhost:3000/dashboard`)
  console.log('─'.repeat(60) + '\n')
}

seed()
  .then(() => process.exit(0))
  .catch(err => { logger.error(err); process.exit(1) })
