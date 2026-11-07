import { Router } from 'express'
import { db }     from '../../db'
import { asyncHandler } from '../middleware/async-handler'

import { sanitizeLogs } from '../../services/sanitizer'
import { withLogHints } from '../../services/llm/evidence'

export const dashboardRouter = Router()

// ─── GET /dashboard/overview — 1 requête CTE ──────────────────────────────────

dashboardRouter.get('/overview', asyncHandler(async (req, res) => {
  const { rows: [data] } = await db.query(`
    WITH monitor_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE last_status = 'ok')      AS ok,
        COUNT(*) FILTER (WHERE last_status = 'failed')  AS failed,
        COUNT(*) FILTER (WHERE last_status = 'late')    AS late,
        COUNT(*) FILTER (WHERE last_status = 'unknown') AS unknown,
        COUNT(*)                                         AS total
      FROM monitors WHERE client_id = $1 AND active = true
    ),
    ai_counts AS (
      SELECT COUNT(*) AS today
      FROM analyses a
      JOIN monitors m ON m.id = a.monitor_id
      WHERE m.client_id = $1 AND a.created_at > NOW() - INTERVAL '24 hours'
    ),
    recent_alerts AS (
      SELECT json_agg(
        json_build_object('name',m.name,'env',m.env,'status',m.last_status,'last_ping_at',m.last_ping_at)
        ORDER BY m.last_ping_at DESC NULLS LAST
      ) AS alerts
      FROM monitors m
      WHERE m.client_id = $1 AND m.last_status IN ('failed','late') AND m.active = true
    )
    SELECT
      json_build_object('ok',mc.ok,'failed',mc.failed,'late',mc.late,'unknown',mc.unknown,'total',mc.total) AS monitors,
      json_build_object('today', ac.today) AS ai,
      COALESCE(ra.alerts, '[]'::json) AS alerts
    FROM monitor_counts mc, ai_counts ac, recent_alerts ra
  `, [res.locals.clientId])

  res.json({
    monitors: {
      ok:      parseInt(data.monitors.ok),
      failed:  parseInt(data.monitors.failed),
      late:    parseInt(data.monitors.late),
      unknown: parseInt(data.monitors.unknown),
      total:   parseInt(data.monitors.total),
    },
    ai:     { today: parseInt(data.ai.today) },
    alerts: data.alerts ?? [],
  })
}))

// ─── GET /dashboard/logs ──────────────────────────────────────────────────────

dashboardRouter.get('/logs', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 100)
  const { rows } = await db.query(`
    SELECT p.status, p.duration_ms, p.records, p.exit_code, p.pinged_at,
           m.id AS monitor_id, m.name AS monitor_name, m.env,
           a.diagnosis, a.model_used, a.alert_type
    FROM pings p
    JOIN monitors m   ON m.id = p.monitor_id
    LEFT JOIN analyses a ON a.ping_id = p.id
    WHERE m.client_id = $1
    ORDER BY p.pinged_at DESC LIMIT $2
  `, [res.locals.clientId, limit])
  res.json(rows)
}))

// ─── GET /dashboard/impact — métriques d'incident (MTTR, downtime, récurrence) ─

dashboardRouter.get('/impact', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string ?? '30'), 1), 365)
  const { rows: [agg] } = await db.query(`
    SELECT
      COUNT(*)::int                                        AS incidents,
      COALESCE(ROUND(AVG(i.duration_ms)), 0)::bigint       AS avg_mttr_ms,
      COALESCE(SUM(i.duration_ms), 0)::bigint              AS total_downtime_ms,
      COUNT(*) FILTER (WHERE i.data_impact = 'confirmed')::int AS data_loss,
      COUNT(DISTINCT i.monitor_id)::int                    AS affected_monitors
    FROM incidents i JOIN monitors m ON m.id = i.monitor_id
    WHERE m.client_id = $1 AND i.resolved_at > NOW() - ($2 || ' days')::interval
  `, [res.locals.clientId, days])

  const { rows: recurring } = await db.query(`
    SELECT m.name, COUNT(*)::int AS n
    FROM incidents i JOIN monitors m ON m.id = i.monitor_id
    WHERE m.client_id = $1 AND i.resolved_at > NOW() - ($2 || ' days')::interval
    GROUP BY m.id, m.name HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 5
  `, [res.locals.clientId, days])

  res.json({
    days,
    incidents:        agg.incidents,
    avgMttrMs:        Number(agg.avg_mttr_ms),
    totalDowntimeMs:  Number(agg.total_downtime_ms),
    dataLoss:         agg.data_loss,
    affectedMonitors: agg.affected_monitors,
    recurring,
  })
}))

// ─── GET /dashboard/analyses ─────────────────────────────────────────────────

dashboardRouter.get('/analyses', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '10'), 50)
  const { rows } = await db.query(`
    SELECT a.id, a.diagnosis, a.model_used, a.alert_type, a.severity,
           a.category, a.prevention, a.confidence, a.correlated_monitors,
           a.user_feedback, a.from_cache, a.tokens_in, a.tokens_out, a.created_at,
           a.checks, a.data_impact, a.fix_minutes, a.ping_id, a.verified_fix, a.fix_verified_at,
           m.id AS monitor_id, m.name AS monitor_name, m.env,
           p.output    AS ping_output,
           p.exit_code AS ping_exit_code
    FROM analyses a
    JOIN monitors m ON m.id = a.monitor_id
    LEFT JOIN pings p ON p.id = a.ping_id
    WHERE m.client_id = $1
    ORDER BY a.created_at DESC LIMIT $2
  `, [res.locals.clientId, limit])
  res.json(rows.map(r => withLogHints(r, s => sanitizeLogs(s).clean)))
}))
