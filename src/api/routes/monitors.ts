import { Router } from 'express'
import { z }      from 'zod'
import { db }     from '../../db'
import { ownsMonitor, requireRole }       from '../middleware/ownership'
import { asyncHandler }                  from '../middleware/async-handler'
import { audit }                         from '../middleware/audit'
import { acknowledgeAlert, snoozeAlert } from '../../services/alerts/dedup'
import { sendAlert }                     from '../../services/alerts'
import { sanitizeLogs }                  from '../../services/sanitizer'
import { withLogHints, evidenceLines }   from '../../services/llm/evidence'
import { knownFix }                      from '../../services/llm/known-fixes'
import { findAnalysis, recordFeedback, recordFix } from '../../services/analysis-feedback'
import { lintCommand }                   from '../../services/llm/command-lint'
import { suggestJobName }                from '../../services/llm/job-names'
import { monitorLimitFor }               from '../../config/plans'

export const monitorsRouter = Router()

const MonitorSchema = z.object({
  name:         z.string().min(1).max(100),
  schedule:     z.string().max(120).optional(),
  grace_period: z.number().int().min(60).max(86400).default(300),
  expected_min: z.number().int().nonnegative().optional(),
  expected_max: z.number().int().nonnegative().optional(),
  env:          z.enum(['development','staging','production']).default('production'),
  notes:        z.string().max(2000).optional(),
})

const PATCHABLE = new Set(['name','schedule','grace_period','expected_min','expected_max','env','active','notes'])

// ─── GET /monitors ────────────────────────────────────────────────────────────

monitorsRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      m.id, m.name, m.schedule, m.grace_period, m.last_ping_at,
      m.last_status, m.env, m.active, m.expected_min, m.expected_max, m.notes,
      COALESCE(
        json_agg(json_build_object('status',p.status,'duration_ms',p.duration_ms)
          ORDER BY p.pinged_at DESC) FILTER (WHERE p.id IS NOT NULL), '[]'
      ) AS recent_pings,
      ROUND(AVG(p.duration_ms) FILTER (
        WHERE p.status='success' AND p.pinged_at > NOW() - INTERVAL '7 days'
      ))::int AS avg_duration_7d
    FROM monitors m
    LEFT JOIN LATERAL (
      SELECT id, status, duration_ms, pinged_at FROM pings
      WHERE monitor_id = m.id ORDER BY pinged_at DESC LIMIT 30
    ) p ON true
    WHERE m.client_id = $1
    GROUP BY m.id
    ORDER BY CASE m.last_status WHEN 'failed' THEN 0 WHEN 'late' THEN 1 ELSE 2 END, m.created_at DESC
  `, [res.locals.clientId])
  res.json(rows)
}))

// ─── GET /monitors/:id ────────────────────────────────────────────────────────

monitorsRouter.get('/:id', ownsMonitor, asyncHandler(async (req, res) => {
  const { rows: [monitor] } = await db.query(`
    SELECT m.*, s.status AS alert_status, s.alert_count, s.first_fired, s.snooze_until
    FROM monitors m
    LEFT JOIN alert_states s ON s.monitor_id = m.id
    WHERE m.id = $1
  `, [req.params.id])
  res.json(monitor)
}))

// ─── POST /monitors ───────────────────────────────────────────────────────────

monitorsRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const monitorLimit = monitorLimitFor(res.locals.plan)
  if (Number.isFinite(monitorLimit)) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM monitors WHERE client_id = $1 AND active = true`,
      [res.locals.clientId]
    )
    if (parseInt(rows[0].count) >= monitorLimit)
      return res.status(403).json({ error: `Free plan: ${monitorLimit} monitors max. Upgrade to Pro for unlimited.` })
  }

  const parsed = MonitorSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { rows: [monitor] } = await db.query(`
    INSERT INTO monitors (client_id, name, schedule, grace_period, expected_min, expected_max, env, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id, ping_key, name, env, schedule, grace_period, last_status
  `, [res.locals.clientId, parsed.data.name, parsed.data.schedule,
      parsed.data.grace_period, parsed.data.expected_min, parsed.data.expected_max, parsed.data.env,
      parsed.data.notes ?? null])

  await audit(res, 'monitor.created', 'monitor', monitor.id, { name: monitor.name, env: monitor.env })
  res.status(201).json(monitor)
}))

// ─── PATCH /monitors/:id ──────────────────────────────────────────────────────

monitorsRouter.patch('/:id', requireRole('admin'), ownsMonitor, asyncHandler(async (req, res) => {
  const UpdateSchema = MonitorSchema.partial().extend({ active: z.boolean().optional() })
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  // `k in req.body` : zod v4 réinjecte les .default() (grace_period, env) sur un .partial(),
  // donc un PATCH sans champ légitime écraserait la ligne avec ces défauts. On ne garde que
  // les champs réellement envoyés par le client.
  const fields = Object.entries(parsed.data).filter(([k]) => PATCHABLE.has(k) && k in req.body)
  if (!fields.length) return res.status(400).json({ error: 'No valid fields' })

  const set    = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')
  const values = fields.map(([, v]) => v)

  const { rows: [updated] } = await db.query(
    `UPDATE monitors SET ${set} WHERE id = $1 RETURNING id, name, active, last_status, env`,
    [req.params.id, ...values]
  )
  await audit(res, 'monitor.updated', 'monitor', req.params.id, { fields: fields.map(([k]) => k) })
  res.json(updated)
}))

// ─── DELETE /monitors/:id ─────────────────────────────────────────────────────

monitorsRouter.delete('/:id', requireRole('admin'), ownsMonitor, asyncHandler(async (req, res) => {
  await db.query(`DELETE FROM monitors WHERE id = $1`, [req.params.id])
  await audit(res, 'monitor.deleted', 'monitor', req.params.id)
  res.json({ ok: true })
}))

// ─── GET /monitors/:id/history ────────────────────────────────────────────────

monitorsRouter.get('/:id/history', ownsMonitor, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 200)
  const { rows } = await db.query(`
    SELECT p.id, p.status, p.duration_ms, p.records, p.exit_code, p.output, p.pinged_at,
           a.id AS analysis_id, a.diagnosis, a.model_used, a.alert_type, a.created_at AS analysed_at
    FROM pings p
    LEFT JOIN analyses a ON a.ping_id = p.id
    WHERE p.monitor_id = $1
    ORDER BY p.pinged_at DESC LIMIT $2
  `, [req.params.id, limit])
  res.json(rows)
}))

// ─── GET /monitors/:id/analyses ───────────────────────────────────────────────

monitorsRouter.get('/:id/analyses', ownsMonitor, asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT a.id, a.diagnosis, a.model_used, a.alert_type, a.severity,
           a.category, a.prevention, a.confidence, a.correlated_monitors,
           a.user_feedback, a.from_cache, a.tokens_in, a.tokens_out, a.created_at,
           a.checks, a.data_impact, a.fix_minutes, a.ping_id, a.verified_fix, a.fix_verified_at, a.explanation, a.resolution,
           p.output    AS ping_output, p.context AS ping_context,
           p.exit_code AS ping_exit_code
    FROM analyses a
    LEFT JOIN pings p ON p.id = a.ping_id
    WHERE a.monitor_id = $1
    ORDER BY a.created_at DESC LIMIT 20
  `, [req.params.id])
  res.json(rows.map(r => withLogHints(r, s => sanitizeLogs(s).clean)))
}))

// ─── POST /monitors/:id/acknowledge ──────────────────────────────────────────

monitorsRouter.post('/:id/acknowledge', requireRole('member'), ownsMonitor, asyncHandler(async (req, res) => {
  await acknowledgeAlert(req.params.id)
  await audit(res, 'monitor.acknowledged', 'monitor', req.params.id)
  res.json({ ok: true, status: 'acknowledged' })
}))

// ─── POST /monitors/:id/snooze ────────────────────────────────────────────────

monitorsRouter.post('/:id/snooze', requireRole('member'), ownsMonitor, asyncHandler(async (req, res) => {
  const minutes = Math.min(Math.max(parseInt(req.body?.minutes ?? '60'), 5), 1440)
  await snoozeAlert(req.params.id, minutes)
  await audit(res, 'monitor.snoozed', 'monitor', req.params.id, { minutes })
  res.json({ ok: true, status: 'snoozed', minutes, until: new Date(Date.now() + minutes * 60000) })
}))


// ─── POST /monitors/:id/pause — pause temporaire (maintenance) ────────────────

monitorsRouter.post('/:id/pause', requireRole('admin'), ownsMonitor, asyncHandler(async (req, res) => {
  const minutes = Math.min(Math.max(parseInt(req.body?.minutes ?? '60'), 1), 1440)
  const until   = new Date(Date.now() + minutes * 60000)

  await db.query(
    `UPDATE monitors SET paused_until = $2 WHERE id = $1`,
    [req.params.id, until]
  )
  await audit(res, 'monitor.paused', 'monitor', req.params.id, { minutes, until })

  res.json({ ok: true, pausedUntil: until, minutes })
}))

// ─── POST /monitors/:id/resume — reprend après pause ─────────────────────────

monitorsRouter.post('/:id/resume', requireRole('admin'), ownsMonitor, asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE monitors SET paused_until = NULL WHERE id = $1`,
    [req.params.id]
  )
  await audit(res, 'monitor.resumed', 'monitor', req.params.id)
  res.json({ ok: true })
}))

// ─── POST /monitors/:id/test — simule un échec pour tester la config ──────────

monitorsRouter.post('/:id/test', ownsMonitor, asyncHandler(async (req, res) => {
  const { rows: [monitor] } = await db.query(`
    SELECT m.name, m.env, c.email, c.slack_webhook, c.webhook_url, c.teams_webhook, c.channels, c.lang
    FROM monitors m JOIN clients c ON c.id = m.client_id
    WHERE m.id = $1
  `, [req.params.id])

  // Envoie une alerte de test directement (bypass queue + LLM)
  await sendAlert({
    jobName:       monitor.name,
    env:           monitor.env,
    lastPingAt:    new Date().toISOString(),
    analysis: {
      cause:      'Ceci est une alerte de test envoyée manuellement depuis le dashboard.',
      action:     'Si vous recevez ceci, votre configuration email/Slack/webhook fonctionne correctement.',
      prevention: 'Aucune action préventive nécessaire pour une alerte de test.',
      severity:   'low',
      category:   'code' as const,
      confidence: 'high' as const,
      checks:     [],
      data_impact: 'none' as const,
      fix_minutes: 5,
      fromCache:  false,
      model:      'test',
    },
    alertCount:    1,
    statusPageUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/status/${req.params.id}`,
    client: { email: monitor.email, slackWebhook: monitor.slack_webhook, webhookUrl: monitor.webhook_url, teamsWebhook: monitor.teams_webhook, channels: monitor.channels, lang: monitor.lang },
  })

  await audit(res, 'monitor.test', 'monitor', req.params.id)
  res.json({ ok: true, message: 'Test alert sent to email and Slack.' })
}))

// ─── GET /monitors/:id/audit — historique des actions ────────────────────────

monitorsRouter.get('/:id/audit', ownsMonitor, asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT action, actor, meta, ip, created_at
    FROM audit_logs
    WHERE client_id = $1 AND resource = 'monitor' AND resource_id = $2
    ORDER BY created_at DESC LIMIT 50
  `, [res.locals.clientId, req.params.id])
  res.json(rows)
}))

// ─── POST /analyses/:analysisId/feedback — feedback utilisateur sur une analyse ─

monitorsRouter.post('/analyses/:analysisId/feedback', asyncHandler(async (req, res) => {
  const { feedback } = req.body  // 'positive' | 'negative'
  if (!['positive', 'negative'].includes(feedback))
    return res.status(400).json({ error: "feedback doit être 'positive' ou 'negative'" })
  const analysis = await findAnalysis(req.params.analysisId, res.locals.clientId)
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' })
  await recordFeedback(analysis, feedback)
  res.json({ ok: true, feedback })
}))

// ─── POST /analyses/:analysisId/fix — ce qui a réellement réglé la panne ────────
// Prime sur l'action du modèle : resservie telle quelle si la même panne revient.

monitorsRouter.post('/analyses/:analysisId/fix', requireRole('member'), asyncHandler(async (req, res) => {
  const parsed = z.object({ fix: z.string().trim().min(3).max(500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const analysis = await findAnalysis(req.params.analysisId, res.locals.clientId)
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' })
  const fix = await recordFix(analysis, parsed.data.fix)
  await audit(res, 'analysis.fix_recorded', 'monitor', analysis.monitor_id, { analysisId: analysis.id })
  res.json({ ok: true, verified_fix: fix })
}))

// ─── POST /lint — risques d'une commande de cron, AVANT toute panne ──────────
// Utilisé par cronguard-import.sh : signale %, -p espacé, syntaxe bash sous sh… à l'import.
// Lecture seule, rien n'est stocké. La réponse ne recopie pas la commande (mot de passe possible).
monitorsRouter.post('/lint', asyncHandler(async (req, res) => {
  const parsed = z.object({ command: z.string().min(1).max(1000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'command requis (1000 caractères max)' })
  res.json({ findings: lintCommand(parsed.data.command) })
}))

// ─── POST /suggest-name — nom d'un job à l'import de la crontab (cronguard-import.sh) ─────
// Planning écrit par le code ; nom et rôle proposés par l'IA locale si un modèle d'explication est déclaré.
// Lecture seule, rien n'est stocké : l'admin voit l'aperçu et choisit d'appliquer.
monitorsRouter.post('/suggest-name', requireRole('member'), asyncHandler(async (req, res) => {
  const parsed = z.object({ command: z.string().min(1).max(1000), schedule: z.string().max(120).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'command requis (1000 caractères max)' })
  res.json(await suggestJobName(parsed.data.command, parsed.data.schedule))
}))

// ─── POST /analyze/preview — Analyse immédiate avec diagnostic complet ────────

monitorsRouter.post('/analyze/preview', asyncHandler(async (req, res) => {
  const Schema = z.object({
    logs:         z.string().min(1).max(4000),
    job_name:     z.string().min(1).max(100).default('test-job'),
    env:          z.enum(['production','staging','development']).default('production'),
    exit_code:    z.number().int().optional(),
    duration_ms:  z.number().int().positive().optional(),
    avg_duration: z.number().int().positive().optional(),
    schedule:     z.string().max(120).optional(),
  })

  const parsed = Schema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() })

  const { logs, job_name, env, exit_code, duration_ms, avg_duration, schedule } = parsed.data
  // Playground diagnostic (2026-11-10) : le même chemin qu'une vraie panne — faits établis tout de suite (fiches,
  // codes, commande ; pas de déduction par le modèle par défaut), puis l'explication de l'IA locale si
  // LLM_EXPLAIN_MODEL est défini. Plus de contrôle préalable du modèle 3B : il ne sert plus par défaut.
  const { analyzeFailure, analysisWithoutModel, llmEnabled } = await import('../../services/llm/analyzer')
  const { explainAnalysis } = await import('../../services/llm/explain')
  const clean = sanitizeLogs(logs).clean
  const ctx = { jobName: job_name, clientId: res.locals.clientId, monitorId: 'preview', env, schedule,
    duration: duration_ms, avgDuration: avg_duration, exitCode: exit_code, logs }
  if (!llmEnabled()) {
    const analysis = analysisWithoutModel(ctx)
    return res.json({ ...analysis, evidence: evidenceLines(clean, analysis.cause), known_fix: knownFix(clean),
      _meta: { job_name, env, model: 'none', logs_length: logs.length, ai: false } })
  }

  // Une analyse à la fois par client : l'explication (et LLM_DEDUCTION=on) appelle le modèle hors file d'attente.
  const { redis } = await import('../../config/redis')
  const lockKey = `preview:lock:${res.locals.clientId}`
  if (!(await redis.set(lockKey, '1', 'EX', 120, 'NX')))
    return res.status(429).json({ error: 'Une analyse est déjà en cours. Patientez quelques secondes.' })
  try {
    const analysis = await analyzeFailure(ctx, 120_000, { skipRateLimit: true }) ?? analysisWithoutModel(ctx)
    const evidence = evidenceLines(clean, analysis.cause)
    const explanation = await explainAnalysis(analysis, clean, evidence[0], 120_000).catch(() => null)
    res.json({ ...analysis, explanation, evidence, known_fix: knownFix(clean),
      _meta: { job_name, env, model: analysis.model, explainModel: process.env.LLM_EXPLAIN_MODEL || null, logs_length: logs.length } })
  } finally {
    await redis.del(lockKey)
  }
}))
