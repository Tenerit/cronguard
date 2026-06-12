import { Router } from 'express'
import { z }      from 'zod'
import { db }     from '../../db'
import { asyncHandler } from '../middleware/async-handler'

export const clientsRouter = Router()

clientsRouter.get('/me', asyncHandler(async (req, res) => {
  const { rows: [client] } = await db.query(`
    SELECT id, email, plan, slack_webhook, webhook_url, created_at,
      (SELECT COUNT(*) FROM monitors WHERE client_id = $1 AND active = true) AS monitor_count
    FROM clients WHERE id = $1
  `, [res.locals.clientId])
  res.json(client)
}))

clientsRouter.patch('/settings', asyncHandler(async (req, res) => {
  const Schema = z.object({
    slack_webhook: z.string().url().optional().or(z.literal('')),
    webhook_url:   z.string().url().optional().or(z.literal('')),
    app_url:       z.string().url().optional(),
  })
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  // Champ fourni (même '') → mis à jour ; '' efface (null). Absent → inchangé.
  const slackGiven   = parsed.data.slack_webhook !== undefined
  const webhookGiven = parsed.data.webhook_url   !== undefined

  const { rows: [client] } = await db.query(`
    UPDATE clients
    SET slack_webhook = CASE WHEN $4 THEN $2 ELSE slack_webhook END,
        webhook_url   = CASE WHEN $5 THEN $3 ELSE webhook_url   END,
        app_url       = COALESCE($6, app_url)
    WHERE id = $1
    RETURNING id, email, plan, slack_webhook, webhook_url, app_url
  `, [
    res.locals.clientId,
    parsed.data.slack_webhook || null,   // $2 : url, ou null si ''
    parsed.data.webhook_url   || null,   // $3
    slackGiven,                          // $4
    webhookGiven,                        // $5
    parsed.data.app_url || null,         // $6
  ])
  res.json(client)
}))
