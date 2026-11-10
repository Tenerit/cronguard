import { Router } from 'express'
import { z }      from 'zod'
import { newApiKey, hashApiKey } from '../../services/api-keys'
import { db }     from '../../db'
import { asyncHandler } from '../middleware/async-handler'
import { requireRole }  from '../middleware/ownership'
import { audit }        from '../middleware/audit'
import { getRedis }        from '../../config/redis'
import { getAnalysisQueue } from '../../queue'
import { unrecognizedFailures } from '../../services/learning'

export const clientsRouter = Router()

// ─── POST /clients/rotate-key — régénère la clé du compte (owner) ─────────────
// Invalide immédiatement l'ancienne clé. Le client DOIT stocker la nouvelle.
clientsRouter.post('/rotate-key', requireRole('owner'), asyncHandler(async (_req, res) => {
  const key = newApiKey()
  const { rows: [c] } = await db.query(
    `UPDATE clients SET api_key = $2 WHERE id = $1 RETURNING id`,
    [res.locals.clientId, hashApiKey(key)]
  )
  if (!c) return res.status(404).json({ error: 'not_found' })
  await audit(res, 'client.key_rotated', 'client', res.locals.clientId)
  res.json({ api_key: key })
}))

// ─── GET /clients/learning — pannes non reconnues + fiches candidates (admin+) ──────
// Non reconnues : 7 derniers jours (par défaut). Candidates : déjà corrigées par l'équipe sur 90 jours.
clientsRouter.get('/learning', requireRole('admin'), asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90)
  const [unrecognized, recent] = await Promise.all([
    unrecognizedFailures(res.locals.clientId, days),
    unrecognizedFailures(res.locals.clientId, 90, 50),
  ])
  res.json({ unrecognized, candidates: recent.filter(f => f.verifiedFix) })
}))

// ─── GET /clients/audit — journal d'audit complet du client (admin+) ──────────
// Qui a fait quoi (acteur = email SSO ou mode d'auth), quand, depuis quelle IP.
clientsRouter.get('/audit', requireRole('admin'), asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '100'), 200)
  const { rows } = await db.query(`
    SELECT actor, action, resource, resource_id, meta, ip, created_at
    FROM audit_logs
    WHERE client_id = $1
    ORDER BY created_at DESC LIMIT $2
  `, [res.locals.clientId, limit])
  res.json(rows)
}))

// ─── DLQ — jobs d'analyse échoués (capturés par le worker) ────────────────────
// GET : inspecter ceux de CE client. POST /replay : les ré-enfiler vers l'analyse.
// Scopé par clientId → pas d'inspection ni de replay cross-tenant.
const DLQ_KEY = 'cronguard:dlq:llm-analysis'
interface DlqEntry { at: number; id: string; name: string; reason: string; data: { clientId?: string; jobName?: string } }

function parseDlq(rows: string[]): DlqEntry[] {
  return rows.map(s => { try { return JSON.parse(s) as DlqEntry } catch { return null } })
             .filter((e): e is DlqEntry => e !== null)
}

clientsRouter.get('/dlq', requireRole('admin'), asyncHandler(async (_req, res) => {
  const mine = parseDlq(await getRedis().lrange(DLQ_KEY, 0, 999))
    .filter(e => e.data?.clientId === res.locals.clientId)
    .map(e => ({ at: e.at, id: e.id, name: e.name, reason: e.reason, job: e.data?.jobName }))
  res.json({ count: mine.length, entries: mine })
}))

clientsRouter.post('/dlq/replay', requireRole('admin'), asyncHandler(async (_req, res) => {
  const rows  = await getRedis().lrange(DLQ_KEY, 0, 999)
  const mine  = rows.filter(s => parseDlq([s])[0]?.data?.clientId === res.locals.clientId)
  const others = rows.filter(s => !mine.includes(s))

  for (const s of mine) {
    const e = parseDlq([s])[0]
    if (e) await getAnalysisQueue().add('analyze', e.data)
  }
  // Réécrit la liste sans les entrées rejouées (conserve celles des autres tenants).
  await getRedis().del(DLQ_KEY)
  if (others.length) await getRedis().rpush(DLQ_KEY, ...others)

  audit(res, 'dlq_replay', 'analysis', undefined, { replayed: mine.length })
  res.json({ replayed: mine.length })
}))

clientsRouter.get('/me', asyncHandler(async (req, res) => {
  const { rows: [client] } = await db.query(`
    SELECT id, email, plan, slack_webhook, webhook_url, teams_webhook, channels,
           escalation_email, escalation_webhook, escalation_after_min,
           created_at,
      (SELECT COUNT(*) FROM monitors WHERE client_id = $1 AND active = true) AS monitor_count
    FROM clients WHERE id = $1
  `, [res.locals.clientId])
  res.json(client)
}))

clientsRouter.patch('/settings', requireRole('admin'), asyncHandler(async (req, res) => {
  const Schema = z.object({
    slack_webhook:          z.string().url().optional().or(z.literal('')),
    webhook_url:            z.string().url().optional().or(z.literal('')),
    teams_webhook:          z.string().url().optional().or(z.literal('')),
    // Autres plateformes (channels.ts). '' efface une plateforme ; absente → inchangée.
    channels: z.object({
      discord:    z.string().url().regex(/^https:\/\//).max(512).or(z.literal('')),
      gchat:      z.string().url().regex(/^https:\/\//).max(512).or(z.literal('')),
      mattermost: z.string().url().max(512).or(z.literal('')),
      ntfy:       z.string().url().max(512).regex(/\/[\w-]{1,64}\/?$/, 'URL ntfy = https://serveur/topic').or(z.literal('')),
      pagerduty:  z.string().regex(/^[A-Za-z0-9]{32}$/, 'clé de routage PagerDuty : 32 caractères').or(z.literal('')),
    }).partial().strict().optional(),
    app_url:                z.string().url().optional(),
    escalation_email:       z.string().email().optional().or(z.literal('')),
    escalation_webhook:     z.string().url().optional().or(z.literal('')),
    escalation_after_min:   z.number().int().min(1).max(1440).optional(),
  })
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const d = parsed.data
  // Champ fourni (même '') → mis à jour ; '' efface (null). Absent → inchangé.
  const slackGiven   = d.slack_webhook          !== undefined
  const webhookGiven = d.webhook_url            !== undefined
  const escEmailGiven   = d.escalation_email    !== undefined
  const escWebhookGiven = d.escalation_webhook  !== undefined
  const teamsGiven      = d.teams_webhook       !== undefined
  // Plateformes : fusion avec l'existant (clé envoyée remplace, '' supprime), faite ici pour rester portable.
  let channels: string | null = null
  if (d.channels) {
    const { rows: [cur] } = await db.query(`SELECT channels FROM clients WHERE id = $1`, [res.locals.clientId])
    const prev = typeof cur?.channels === 'string' ? JSON.parse(cur.channels) : (cur?.channels ?? {})   // jsonb lu en texte selon le driver
    const merged: Record<string, string> = { ...prev, ...d.channels }
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k]
    channels = JSON.stringify(merged)
  }

  const { rows: [client] } = await db.query(`
    UPDATE clients
    SET slack_webhook        = CASE WHEN $4  THEN $2  ELSE slack_webhook        END,
        webhook_url          = CASE WHEN $5  THEN $3  ELSE webhook_url          END,
        app_url              = COALESCE($6, app_url),
        escalation_email     = CASE WHEN $8  THEN $7  ELSE escalation_email     END,
        escalation_webhook   = CASE WHEN $10 THEN $9  ELSE escalation_webhook   END,
        escalation_after_min = COALESCE($11, escalation_after_min),
        teams_webhook        = CASE WHEN $13 THEN $12 ELSE teams_webhook        END,
        channels             = COALESCE($14::jsonb, channels)
    WHERE id = $1
    RETURNING id, email, plan, slack_webhook, webhook_url, teams_webhook, channels, app_url,
              escalation_email, escalation_webhook, escalation_after_min
  `, [
    res.locals.clientId,
    d.slack_webhook       || null,   // $2
    d.webhook_url         || null,   // $3
    slackGiven,                      // $4
    webhookGiven,                    // $5
    d.app_url             || null,   // $6
    d.escalation_email    || null,   // $7
    escEmailGiven,                   // $8
    d.escalation_webhook  || null,   // $9
    escWebhookGiven,                 // $10
    d.escalation_after_min ?? null,  // $11
    d.teams_webhook       || null,   // $12
    teamsGiven,                      // $13
    channels,                        // $14
  ])
  await audit(res, 'settings.updated', 'client', res.locals.clientId, { fields: Object.keys(d) })
  res.json(client)
}))
