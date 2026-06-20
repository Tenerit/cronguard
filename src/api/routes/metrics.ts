import { Request, Response } from 'express'
import { db }     from '../../db'
import { redis }  from '../../config/redis'
import { logger } from '../../config/logger'

// ─── Export Prometheus ────────────────────────────────────────────────────────
// GET /metrics — format texte Prometheus (exposition 0.0.4).
// Métriques globales de l'instance (pour Grafana/alerting ops).
// Protégé par METRICS_TOKEN si défini, sinon ouvert (réseau interne).

function line(name: string, value: number, labels?: Record<string, string>): string {
  const lbl = labels
    ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
    : ''
  return `${name}${lbl} ${value}`
}

export async function metricsHandler(req: Request, res: Response) {
  // Fermé par défaut (anti-fuite cross-tenant). Exposer = définir METRICS_TOKEN,
  // ou METRICS_PUBLIC=true pour l'ouvrir explicitement sur un réseau interne de confiance.
  const token    = process.env.METRICS_TOKEN
  const isPublic = process.env.METRICS_PUBLIC === 'true'
  if (!token && !isPublic) {
    return res.status(401).type('text/plain')
      .send('# /metrics fermé — définir METRICS_TOKEN, ou METRICS_PUBLIC=true (réseau interne)\n')
  }
  if (token) {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const given  = bearer ?? (req.query.token as string | undefined)
    if (given !== token) return res.status(401).type('text/plain').send('# unauthorized\n')
  }

  try {
    const [byStatus, alerts, pings24, analyses24, analysisGaps] = await Promise.all([
      db.query(`SELECT last_status, COUNT(*)::int AS n FROM monitors WHERE active = true GROUP BY last_status`),
      db.query(`SELECT COUNT(*)::int AS n FROM alert_states WHERE status = 'firing'`),
      db.query(`SELECT COUNT(*)::int AS n FROM pings    WHERE pinged_at  > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*)::int AS n FROM analyses WHERE created_at > NOW() - INTERVAL '24 hours'`),
      // Pannes d'analyse silencieuses : pings échoués (>5min, le worker a eu le temps)
      // sans ligne analyses → le LLM ne produit rien sans le dire. Surface pour alerting.
      db.query(`SELECT COUNT(*)::int AS n FROM pings p
                WHERE p.status != 'success'
                  AND p.pinged_at > NOW() - INTERVAL '24 hours'
                  AND p.pinged_at < NOW() - INTERVAL '5 minutes'
                  AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.ping_id = p.id)`),
    ])

    // Dead-man / stall (Redis, cross-process) : âge du heartbeat worker + profondeur
    // de la queue d'analyse. Si le worker meurt, le heartbeat vieillit et la queue
    // gonfle → Prometheus alerte (sinon le monitoring s'arrête en silence).
    let heartbeatAge = 999999  // sentinelle « pas de heartbeat » → déclenche l'alerte
    let queueDepth   = 0
    let dlqDepth     = 0
    try { const hb = await redis.get('worker:heartbeat'); if (hb) heartbeatAge = Math.max(0, Math.round((Date.now() - Number(hb)) / 1000)) } catch { /* redis down → sentinelle */ }
    try { queueDepth = await redis.llen('bull:llm-analysis:waiting') } catch { /* idem */ }
    try { dlqDepth   = await redis.llen('cronguard:dlq:llm-analysis') } catch { /* idem */ }

    // Échecs de livraison de notification (counter cumulé, incrémenté par les workers).
    const notifyFail: Record<string, number> = { email: 0, slack: 0, webhook: 0 }
    try {
      const [e, s, w] = await Promise.all([
        redis.get('metrics:notify_fail:email'),
        redis.get('metrics:notify_fail:slack'),
        redis.get('metrics:notify_fail:webhook'),
      ])
      notifyFail.email = Number(e ?? 0); notifyFail.slack = Number(s ?? 0); notifyFail.webhook = Number(w ?? 0)
    } catch { /* redis down → 0 */ }

    const statusCounts: Record<string, number> = { ok: 0, late: 0, failed: 0, unknown: 0 }
    for (const r of byStatus.rows) statusCounts[r.last_status] = (statusCounts[r.last_status] ?? 0) + r.n
    const activeTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0)

    const out: string[] = [
      '# HELP cronguard_up 1 si l\'API et la DB répondent',
      '# TYPE cronguard_up gauge',
      line('cronguard_up', 1),

      '# HELP cronguard_monitors_active Monitors actifs par statut',
      '# TYPE cronguard_monitors_active gauge',
      ...Object.entries(statusCounts).map(([status, n]) => line('cronguard_monitors_active', n, { status })),

      '# HELP cronguard_monitors_active_total Total des monitors actifs',
      '# TYPE cronguard_monitors_active_total gauge',
      line('cronguard_monitors_active_total', activeTotal),

      '# HELP cronguard_alerts_firing Alertes actuellement en cours',
      '# TYPE cronguard_alerts_firing gauge',
      line('cronguard_alerts_firing', alerts.rows[0]?.n ?? 0),

      '# HELP cronguard_pings_24h Pings reçus sur 24h',
      '# TYPE cronguard_pings_24h gauge',
      line('cronguard_pings_24h', pings24.rows[0]?.n ?? 0),

      '# HELP cronguard_analyses_24h Analyses IA produites sur 24h',
      '# TYPE cronguard_analyses_24h gauge',
      line('cronguard_analyses_24h', analyses24.rows[0]?.n ?? 0),

      '# HELP cronguard_analysis_failures_24h Pings échoués (>5min) sans analyse IA produite',
      '# TYPE cronguard_analysis_failures_24h gauge',
      line('cronguard_analysis_failures_24h', analysisGaps.rows[0]?.n ?? 0),

      '# HELP cronguard_analysis_queue_depth Jobs d\'analyse en attente (gonfle si le worker est mort)',
      '# TYPE cronguard_analysis_queue_depth gauge',
      line('cronguard_analysis_queue_depth', queueDepth),

      '# HELP cronguard_analysis_dlq_depth Jobs d\'analyse échoués en dead-letter (inspection/replay)',
      '# TYPE cronguard_analysis_dlq_depth gauge',
      line('cronguard_analysis_dlq_depth', dlqDepth),

      '# HELP cronguard_worker_heartbeat_age_seconds Âge du dernier heartbeat worker (dead-man — alerter si > 600)',
      '# TYPE cronguard_worker_heartbeat_age_seconds gauge',
      line('cronguard_worker_heartbeat_age_seconds', heartbeatAge),

      '# HELP cronguard_notification_failures_total Échecs de livraison de notification (cumulé) par canal',
      '# TYPE cronguard_notification_failures_total counter',
      ...Object.entries(notifyFail).map(([channel, n]) => line('cronguard_notification_failures_total', n, { channel })),
    ]

    res.type('text/plain; version=0.0.4').send(out.join('\n') + '\n')
  } catch (err) {
    logger.error('[Metrics] DB error', { err: (err as Error).message })
    res.status(503).type('text/plain').send('cronguard_up 0\n')
  }
}
