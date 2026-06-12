/**
 * Rétention des données — tourne tous les jours à 3h du matin
 *
 * Plan free : 30 jours de pings / 7 jours d'analyses
 * Plan pro  : 90 jours de pings / 30 jours d'analyses
 *
 * Sans ce worker, les tables pings et analyses grossissent indéfiniment.
 * 1000 clients × 10 jobs × pings toutes les heures = 7M lignes/mois.
 */
import 'dotenv/config'
import { validateEnv } from '../config/env'
validateEnv()
import { db }     from '../db'
import { redis }  from '../config/redis'
import { logger } from '../config/logger'

const INTERVALS_BY_PLAN = {
  free: { pings: 30, analyses: 7  },
  pro:  { pings: 90, analyses: 30 },
}

// ─── Cleanup principal ────────────────────────────────────────────────────────

async function runRetention() {
  logger.info('[Retention] Starting cleanup...')
  let totalPings = 0, totalAnalyses = 0

  for (const [plan, intervals] of Object.entries(INTERVALS_BY_PLAN)) {
    // Supprime les vieux pings pour ce plan
    const { rowCount: pingsDeleted } = await db.query(`
      DELETE FROM pings
      WHERE pinged_at < NOW() - INTERVAL '${intervals.pings} days'
        AND monitor_id IN (
          SELECT m.id FROM monitors m
          JOIN clients c ON c.id = m.client_id
          WHERE c.plan = $1
        )
    `, [plan])

    // Supprime les vieilles analyses pour ce plan
    const { rowCount: analysesDeleted } = await db.query(`
      DELETE FROM analyses
      WHERE created_at < NOW() - INTERVAL '${intervals.analyses} days'
        AND monitor_id IN (
          SELECT m.id FROM monitors m
          JOIN clients c ON c.id = m.client_id
          WHERE c.plan = $1
        )
    `, [plan])

    totalPings    += pingsDeleted ?? 0
    totalAnalyses += analysesDeleted ?? 0

    logger.info(`[Retention] Plan ${plan}`, {
      pings:    pingsDeleted,
      analyses: analysesDeleted,
    })
  }

  // Nettoie aussi les logs d'audit après 90 jours (tous plans)
  const { rowCount: auditDeleted } = await db.query(`
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'
  `)

  // Expire les reset tokens périmés
  await db.query(`
    UPDATE clients SET reset_token = NULL, reset_token_exp = NULL
    WHERE reset_token_exp < NOW()
  `)

  logger.info('[Retention] Done', {
    pings:     totalPings,
    analyses:  totalAnalyses,
    auditLogs: auditDeleted,
  })
}

// ─── Scheduler — tous les jours à 3h du matin ─────────────────────────────────

function msUntil3am(): number {
  const now  = new Date()
  const next = new Date(now)
  next.setHours(3, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

async function start() {
  logger.info('[Retention] Scheduled — runs daily at 3am')

  // Exécution immédiate si variable d'env forcée (pour les tests)
  if (process.env.RUN_RETENTION_NOW === 'true') {
    await runRetention()
    process.exit(0)
  }

  // Première exécution à 3h du matin
  setTimeout(async () => {
    await runRetention()
    setInterval(runRetention, 24 * 60 * 60 * 1000) // puis toutes les 24h
  }, msUntil3am())
}

start().catch(err => { logger.error('[Retention] Fatal', { err }); process.exit(1) })

async function shutdown() {
  await redis.quit()
  await db.end()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)
