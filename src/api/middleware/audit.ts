import { Response } from 'express'
import { db }     from '../../db'
import { logger } from '../../config/logger'

// ─── audit ────────────────────────────────────────────────────────────────────
// Enregistre une action dans audit_logs. Prend `res` pour capturer l'ACTEUR
// (email SSO si présent, sinon le mode d'auth) en plus du client et de l'IP.
// Usage dans une route :
//   await audit(res, 'monitor.created', 'monitor', monitorId, { name })

export async function audit(
  res:        Response,
  action:     string,
  resource:   string,
  resourceId?: string,
  meta:       Record<string, unknown> = {}
): Promise<void> {
  try {
    const clientId = res.locals.clientId
    const actor    = res.locals.email ?? res.locals.authVia ?? 'apikey'
    const ip       = res.req?.ip ?? null
    await db.query(`
      INSERT INTO audit_logs (client_id, actor, action, resource, resource_id, meta, ip)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      clientId, actor, action, resource, resourceId ?? null,
      JSON.stringify(meta), ip,
    ])
  } catch (err) {
    // Ne jamais faire échouer une route à cause des audit logs
    logger.error('[Audit] Insert failed', { err })
  }
}
