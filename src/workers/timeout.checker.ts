import 'dotenv/config'
import { validateEnv }  from '../config/env'
validateEnv()
import { isLate } from './late'
import { db }           from '../db'
import { logger }       from '../config/logger'
import { analysisQueue } from '../queue'
import { getRedis } from '../config/redis'
import { sendOnboardingReminders } from '../services/onboarding'
import { scheduleWeeklyReports }   from '../services/weekly-report'
import { checkEscalations }        from '../services/alerts/dedup'
import { sendEscalation }          from '../services/alerts'
import { getAllActiveWindows, isMonitorInMaintenance, MaintenanceWindow } from '../services/maintenance'

const INTERVAL       = 60_000
const ANOMALY_FACTOR = 2.5
// Warm-up anti-faux-positifs : ne déclenche une alerte "slowdown" que si la baseline
// repose sur assez de succès passés. Sur 1-2 échantillons la moyenne est instable →
// un job neuf ou naturellement variable génère du bruit (= fatigue d'alerte semaine 1).
const SLOW_MIN_SAMPLES = Math.max(1, parseInt(process.env.SLOW_WARMUP_SAMPLES ?? '5'))
// Plancher absolu : × 2,5 sur un job de quelques millisecondes n'est que du bruit (labo terrain 2, 2026-11-12 :
// « 291 ms, moyenne 66 ms » alertait sur 8 jobs sains). Il faut aussi dépasser la moyenne d'au moins 30 s.
const SLOW_MIN_DELTA_MS = Math.max(0, parseInt(process.env.SLOW_MIN_DELTA_MS ?? '30000'))

async function check() {
  const windows = await getAllActiveWindows()
  const [late, slow, hung] = await Promise.all([checkLate(windows), checkSlow(windows), checkHung(windows)])
  if (late + slow + hung > 0) logger.info('[Checker]', { late, slow, hung })
  await runEscalations()
}

async function runEscalations() {
  const targets = await checkEscalations()
  if (targets.length === 0) return
  logger.info('[Checker] Escalations', { count: targets.length })
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  for (const t of targets) {
    await sendEscalation({
      jobName:           t.jobName,
      env:               t.env,
      firstFired:        t.firstFired,
      alertCount:        t.alertCount,
      statusPageUrl:     `${appUrl}/status`,
      escalationEmail:   t.escalationEmail,
      escalationWebhook: t.escalationWebhook,
      analysis:          t.lastAnalysis,
      lang:              t.lang ?? undefined,
    })
  }
}

async function checkLate(windows: Map<string, MaintenanceWindow[]>): Promise<number> {
  // On récupère les candidats actifs et on décide en JS : un monitor avec un
  // schedule cron est jugé sur l'heure d'exécution attendue (précis), sinon on
  // retombe sur la grace depuis le dernier ping.
  const { rows } = await db.query(`
    SELECT m.id, m.client_id, m.name, m.schedule, m.env,
           m.expected_min, m.expected_max, m.last_ping_at, m.grace_period, m.created_at,
           (SELECT pinged_at FROM pings WHERE monitor_id=m.id AND status='success' ORDER BY pinged_at DESC LIMIT 1) AS last_success,
           (SELECT AVG(duration_ms) FROM pings WHERE monitor_id=m.id AND status='success' AND pinged_at > NOW()-INTERVAL '7 days') AS avg_dur,
           d.p95_ms, d.dur_n
    FROM monitors m
    -- Grâce apprise (late.ts) : p95 des 30 dernières durées réussies.
    LEFT JOIN LATERAL (
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY r.duration_ms) AS p95_ms, COUNT(*) AS dur_n
      FROM (SELECT duration_ms FROM pings WHERE monitor_id=m.id AND status='success' AND duration_ms IS NOT NULL
            ORDER BY pinged_at DESC LIMIT 30) r
    ) d ON true
    WHERE m.active=true
      AND m.last_status NOT IN ('late','failed')
      AND m.last_start_at IS NULL          -- job en cours d'exécution → géré par checkHung
      AND (m.paused_until IS NULL OR m.paused_until < NOW())
  `)
  let count = 0
  for (const m of rows) {
    if (!isLate(m)) continue
    if (isMonitorInMaintenance(m.id, windows.get(m.client_id) ?? [])) {
      logger.debug('[Checker] Late suppressed — maintenance window', { job: m.name })
      continue
    }
    await db.query(`UPDATE monitors SET last_status='late' WHERE id=$1`, [m.id])
    await enqueue(m, lateLog(m), 'timeout', 1)
    count++
  }
  return count
}

export { isLate } from './late'

async function checkSlow(windows: Map<string, MaintenanceWindow[]>): Promise<number> {
  const { rows } = await db.query(`
    SELECT p.id AS ping_id, p.monitor_id, p.duration_ms, p.output,
           m.client_id, m.name, m.schedule, m.env, m.expected_min, m.expected_max,
           (SELECT AVG(duration_ms) FROM pings WHERE monitor_id=m.id AND status='success'
            AND pinged_at > NOW()-INTERVAL '7 days' AND id!=p.id) AS avg_dur
    FROM pings p JOIN monitors m ON m.id=p.monitor_id
    WHERE p.status='success' AND p.pinged_at > NOW()-INTERVAL '5 minutes'
      AND p.duration_ms IS NOT NULL
      AND p.duration_ms > (
        SELECT AVG(duration_ms)*$1 FROM pings
        WHERE monitor_id=p.monitor_id AND status='success'
          AND pinged_at > NOW()-INTERVAL '7 days' AND id!=p.id
      )
      AND p.duration_ms - (
        SELECT AVG(duration_ms) FROM pings
        WHERE monitor_id=p.monitor_id AND status='success'
          AND pinged_at > NOW()-INTERVAL '7 days' AND id!=p.id
      ) >= $3
      AND (
        SELECT COUNT(*) FROM pings
        WHERE monitor_id=p.monitor_id AND status='success'
          AND pinged_at > NOW()-INTERVAL '7 days' AND id!=p.id
      ) >= $2
      AND NOT EXISTS (SELECT 1 FROM analyses WHERE ping_id=p.id)
  `, [ANOMALY_FACTOR, SLOW_MIN_SAMPLES, SLOW_MIN_DELTA_MS])
  let count = 0
  for (const p of rows) {
    if (isMonitorInMaintenance(p.monitor_id, windows.get(p.client_id) ?? [])) {
      logger.debug('[Checker] Slow suppressed — maintenance window', { job: p.name })
      continue
    }
    await enqueue(p, slowLog(p), 'slowdown', 5)
    count++
  }
  return count
}

// ─── Détection des jobs "hung" (démarré via /start, jamais terminé) ───────────
// Seuil : 3× la durée habituelle (plancher 2min), ou 1h sans baseline. Alerte
// une seule fois par run (hung_alerted), réinitialisé à la complétion/au start.

const HUNG_FLOOR_MS = 120_000
const HUNG_NO_BASELINE_MS = 3_600_000

function hungThreshold(avgDur?: number): number {
  return avgDur && avgDur > 0 ? Math.max(avgDur * 3, HUNG_FLOOR_MS) : HUNG_NO_BASELINE_MS
}

async function checkHung(windows: Map<string, MaintenanceWindow[]>): Promise<number> {
  const { rows } = await db.query(`
    SELECT m.id, m.client_id, m.name, m.schedule, m.env, m.last_start_at,
           (SELECT AVG(duration_ms) FROM pings WHERE monitor_id=m.id AND status='success'
            AND pinged_at > NOW()-INTERVAL '7 days') AS avg_dur
    FROM monitors m
    WHERE m.active=true
      AND m.last_start_at IS NOT NULL
      AND m.hung_alerted = false
      AND (m.paused_until IS NULL OR m.paused_until < NOW())
  `)
  let count = 0
  for (const m of rows) {
    const runningMs = Date.now() - new Date(m.last_start_at).getTime()
    if (runningMs <= hungThreshold(m.avg_dur)) continue
    if (isMonitorInMaintenance(m.id, windows.get(m.client_id) ?? [])) {
      logger.debug('[Checker] Hung suppressed — maintenance window', { job: m.name })
      continue
    }
    await db.query(`UPDATE monitors SET hung_alerted=true WHERE id=$1`, [m.id])
    await enqueue(m, hungLog(m, runningMs), 'hung', 1)
    count++
  }
  return count
}

function hungLog(m: MonitorRow, runningMs: number): string {
  const mins = Math.round(runningMs / 60000)
  return [
    `HUNG: "${m.name}" a démarré (/start) mais n'a jamais signalé sa fin.`,
    `En cours depuis ${mins} min — bien au-delà de sa durée habituelle.`,
    m.avg_dur ? `Durée habituelle : ${Math.round(m.avg_dur)}ms` : '',
    m.schedule && `Planning : ${m.schedule}`,
    `Causes probables : process bloqué, deadlock, attente réseau infinie, OOM silencieux.`,
  ].filter(Boolean).join('\n')
}

async function enqueue(m: MonitorRow, logs: string, type: string, priority: number) {
  try {
    await analysisQueue.add(`analyze-${type}`, {
      monitorId: m.id ?? m.monitor_id, clientId: m.client_id, pingId: m.ping_id,
      jobName: m.name, env: m.env, schedule: m.schedule,
      lastSuccess: m.last_success ?? m.last_ping_at,
      durationMs: m.duration_ms, avgDuration: m.avg_dur ? Math.round(m.avg_dur) : undefined,
      expectedMin: m.expected_min, expectedMax: m.expected_max, logs,
    }, { priority })
  } catch (e) {
    // Redis/queue down : NE PAS laisser une seule erreur d'enqueue tuer le tick — sinon
    // les autres monitors du tick ne sont jamais vérifiés et le process crash-loop.
    // Échec BRUYANT : l'alerte détectée est perdue ce tick mais visible (pas de drop muet).
    logger.error('[Checker] enqueue échoué — alerte NON livrée ce tick (Redis down ?)',
      { job: m.name, type, err: (e as Error).message })
  }
}

function lateLog(m: MonitorRow): string {
  const ago = m.last_ping_at
    ? `${Math.round((Date.now()-new Date(m.last_ping_at).getTime())/60000)}min` : 'jamais'
  return [`TIMEOUT: "${m.name}" n'a pas pingé.`, `Dernier ping: ${ago}`,
    m.schedule && `Planning: ${m.schedule}`, m.avg_dur && `Durée habituelle: ${Math.round(m.avg_dur)}ms`,
  ].filter(Boolean).join('\n')
}

function slowLog(p: MonitorRow & {duration_ms?: number; pinged_at?: string}): string {
  const mult = p.duration_ms && p.avg_dur ? (p.duration_ms/p.avg_dur).toFixed(1) : '?'
  const avgMs = p.avg_dur ? Math.round(p.avg_dur) : 0
  return [`PERFORMANCE: "${p.name}" ×${mult} plus lent.`,
    `Durée: ${p.duration_ms||0}ms | Moyenne: ${avgMs}ms`,
    p.output && `Logs:\n${p.output.slice(0,1000)}`,
  ].filter(Boolean).join('\n')
}

logger.info('[Checker] Started — 60s interval')

// Garde anti-chevauchement : sous charge (centaines de monitors, requêtes corrélées),
// un tick peut dépasser 60s. Sans garde, `setInterval` en lancerait un 2e par-dessus →
// double charge DB pile quand ça va déjà mal. On skip le tick si le précédent tourne.
let checking = false
async function tick() {
  if (checking) { logger.warn('[Checker] tick précédent encore en cours (>60s) — skip'); return }
  checking = true
  try { await check() } finally { checking = false }
}

tick()

// Vérifie et expire les trials Pro toutes les heures
async function expireTrials() {
  // stripe_id IS NULL : ne JAMAIS downgrader un client qui a un abonnement Stripe.
  // Un client passé du trial à un abonnement payant garde trial_ends_at — sans ce
  // garde-fou, son ancienne date de trial le repasserait en free alors qu'il paie.
  const { rowCount } = await db.query(`
    UPDATE clients SET plan = 'free'
    WHERE plan = 'pro'
      AND stripe_id IS NULL
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
  `)
  if ((rowCount ?? 0) > 0) logger.info('[Checker] Trials expired', { count: rowCount })
}

expireTrials()
setInterval(expireTrials, 60 * 60 * 1000)

// Rappels onboarding — vérifie 1× par heure
sendOnboardingReminders()
setInterval(sendOnboardingReminders, 60 * 60 * 1000)

// Rapport hebdomadaire — chaque lundi à 8h
scheduleWeeklyReports()

const timer = setInterval(tick, INTERVAL)

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`[Checker] ${signal} — arrêt propre`)
  clearInterval(timer)
  await getRedis().quit()
  await db.end()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  logger.error('[Checker] Uncaught exception', { err: err.message, stack: err.stack })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('[Checker] Unhandled rejection', { reason: String(reason) })
  process.exit(1)
})

interface MonitorRow {
  id: string; client_id: string; name: string; schedule?: string; env: string
  expected_min?: number; expected_max?: number; last_ping_at?: string
  last_success?: string; avg_dur?: number; duration_ms?: number
  monitor_id?: string; ping_id?: string; output?: string
  grace_period?: number; created_at?: string; last_start_at?: string
  p95_ms?: number | string | null; dur_n?: number | string | null
}

