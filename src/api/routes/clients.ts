import { Router } from 'express'
import { z }      from 'zod'
import { db }     from '../../db'
import { asyncHandler } from '../middleware/async-handler'
import { requireRole }  from '../middleware/ownership'
import { audit }        from '../middleware/audit'

export const clientsRouter = Router()

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

clientsRouter.get('/me', asyncHandler(async (req, res) => {
  const { rows: [client] } = await db.query(`
    SELECT id, email, plan, slack_webhook, webhook_url,
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

  const { rows: [client] } = await db.query(`
    UPDATE clients
    SET slack_webhook        = CASE WHEN $4  THEN $2  ELSE slack_webhook        END,
        webhook_url          = CASE WHEN $5  THEN $3  ELSE webhook_url          END,
        app_url              = COALESCE($6, app_url),
        escalation_email     = CASE WHEN $8  THEN $7  ELSE escalation_email     END,
        escalation_webhook   = CASE WHEN $10 THEN $9  ELSE escalation_webhook   END,
        escalation_after_min = COALESCE($11, escalation_after_min)
    WHERE id = $1
    RETURNING id, email, plan, slack_webhook, webhook_url, app_url,
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
  ])
  await audit(res, 'settings.updated', 'client', res.locals.clientId, { fields: Object.keys(d) })
  res.json(client)
}))
