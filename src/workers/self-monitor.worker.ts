/**
 * Self-monitoring — CronGuard se surveille lui-même
 *
 * Toutes les 5 minutes, vérifie que l'API, les workers, et Redis répondent.
 * Si quelque chose casse, envoie une alerte directe par email (pas via la queue
 * qui pourrait être la source du problème).
 *
 * Ironie assumée : on utilise les mêmes mécanismes qu'on surveille.
 */
import 'dotenv/config'
import { validateEnv } from '../config/env'
validateEnv()
import { db }     from '../db'
import { redis }  from '../config/redis'
import { logger } from '../config/logger'
import axios       from 'axios'
import nodemailer  from 'nodemailer'

const CHECK_INTERVAL = 5 * 60 * 1000   // 5 minutes
// En conteneur, APP_URL (URL publique des liens) ne joint pas forcément l'API : adresse interne dédiée.
const API_URL        = process.env.SELF_MONITOR_API_URL ?? process.env.APP_URL ?? 'http://localhost:3000'
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL ?? process.env.SMTP_FROM ?? ''

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkAPI(): Promise<boolean> {
  try {
    const res = await axios.get(`${API_URL}/health`, { timeout: 5000 })
    return res.data?.ok === true
  } catch { return false }
}

async function checkDB(): Promise<boolean> {
  try {
    await db.query('SELECT 1')
    return true
  } catch { return false }
}

async function checkRedis(): Promise<boolean> {
  try {
    await redis.ping()
    return true
  } catch { return false }
}

async function checkWorkerHeartbeat(): Promise<boolean> {
  // Le worker écrit une clé Redis toutes les 5 min pour signaler sa présence
  const ts = await redis.get('worker:heartbeat')
  if (!ts) return false
  return Date.now() - parseInt(ts) < 10 * 60 * 1000 // absent depuis > 10min = problème
}

async function checkQueueNotStuck(): Promise<boolean> {
  // Alerte si des jobs LLM attendent depuis > 15 minutes
  const waiting = await redis.llen('bull:llm-analysis:waiting')
  if (waiting > 100) {
    logger.warn('[SelfMonitor] Queue stuck', { waiting })
    return false
  }
  return true
}

// ─── Alerte directe (bypass la queue) ────────────────────────────────────────

async function sendCriticalAlert(failures: string[]) {
  if (!ADMIN_EMAIL || !process.env.SMTP_PASS) {
    logger.error('[SelfMonitor] CRITICAL — no admin email configured', { failures })
    return
  }

  const mailer = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT ?? '465'),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  await mailer.sendMail({
    from:    `"CronGuard Monitor" <${process.env.SMTP_FROM}>`,
    to:      ADMIN_EMAIL,
    subject: `🚨 CronGuard INTERNAL ALERT — ${failures.length} service(s) down`,
    html: `
    <div style="font-family:sans-serif;max-width:480px;padding:24px">
      <h2 style="color:#f87171">CronGuard est dégradé</h2>
      <p>Les services suivants ne répondent pas :</p>
      <ul style="color:#ef4444">
        ${failures.map(f => `<li>${f}</li>`).join('')}
      </ul>
      <p style="color:#64748b;font-size:12px">
        ${new Date().toISOString()} · Self-monitoring internal
      </p>
    </div>`,
  }).catch(err => logger.error('[SelfMonitor] Alert email failed', { err }))
}

// ─── Run all checks ───────────────────────────────────────────────────────────

let lastAlertSent = 0
const ALERT_COOLDOWN = 30 * 60 * 1000  // alerte max 1× par 30min

async function runChecks() {
  const results = await Promise.allSettled([
    checkAPI().then(ok => ({ name: 'API /health', ok })),
    checkDB().then(ok => ({ name: 'PostgreSQL', ok })),
    checkRedis().then(ok => ({ name: 'Redis', ok })),
    checkWorkerHeartbeat().then(ok => ({ name: 'Workers heartbeat', ok })),
    checkQueueNotStuck().then(ok => ({ name: 'LLM queue', ok })),
  ])

  const failures = results
    .filter(r => r.status === 'fulfilled' && !r.value.ok)
    .map(r => (r as PromiseFulfilledResult<{ name: string; ok: boolean }>).value.name)

  if (failures.length === 0) {
    logger.debug('[SelfMonitor] All checks OK')
    return
  }

  logger.error('[SelfMonitor] FAILURES', { failures })

  // Cooldown pour ne pas spammer
  if (Date.now() - lastAlertSent > ALERT_COOLDOWN) {
    await sendCriticalAlert(failures)
    lastAlertSent = Date.now()
  }
}

// ─── Worker heartbeat (écrit par les workers eux-mêmes) ──────────────────────
// Les workers analysis.worker.ts et timeout.checker.ts doivent appeler cette
// fonction périodiquement pour signaler leur présence.

export async function writeHeartbeat(): Promise<void> {
  await redis.setex('worker:heartbeat', 600, String(Date.now()))
}

// ─── Start ────────────────────────────────────────────────────────────────────

// Importé par analysis.worker (writeHeartbeat) : sans ce garde, le worker lancerait un second
// self-monitor et son SIGTERM ferait process.exit avant l'arrêt propre des jobs.
if (require.main === module) {
  logger.info('[SelfMonitor] Started — checks every 5min')
  // Démarrés ensemble, l'API n'écoute pas encore : un contrôle immédiat alerterait à chaque redémarrage.
  const firstCheck = setTimeout(runChecks, 30_000)
  const timer = setInterval(runChecks, CHECK_INTERVAL)

  async function shutdown() {
    clearTimeout(firstCheck)
    clearInterval(timer)
    await redis.quit()
    await db.end()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  process.on('uncaughtException', (err) => {
    logger.error('[SelfMonitor] Uncaught exception', { err: err.message, stack: err.stack })
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('[SelfMonitor] Unhandled rejection', { reason: String(reason) })
    process.exit(1)
  })
}
