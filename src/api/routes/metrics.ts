import { Request, Response } from 'express'
import { db }     from '../../db'
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
  // Auth optionnelle par token
  const token = process.env.METRICS_TOKEN
  if (token) {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const given  = bearer ?? (req.query.token as string | undefined)
    if (given !== token) return res.status(401).type('text/plain').send('# unauthorized\n')
  }

  try {
    const [byStatus, alerts, pings24, analyses24] = await Promise.all([
      db.query(`SELECT last_status, COUNT(*)::int AS n FROM monitors WHERE active = true GROUP BY last_status`),
      db.query(`SELECT COUNT(*)::int AS n FROM alert_states WHERE status = 'firing'`),
      db.query(`SELECT COUNT(*)::int AS n FROM pings    WHERE pinged_at  > NOW() - INTERVAL '24 hours'`),
      db.query(`SELECT COUNT(*)::int AS n FROM analyses WHERE created_at > NOW() - INTERVAL '24 hours'`),
    ])

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
    ]

    res.type('text/plain; version=0.0.4').send(out.join('\n') + '\n')
  } catch (err) {
    logger.error('[Metrics] DB error', { err: (err as Error).message })
    res.status(503).type('text/plain').send('cronguard_up 0\n')
  }
}
