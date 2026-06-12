import { Request, Response, NextFunction } from 'express'
import { db }     from '../../db'
import { logger } from '../../config/logger'

// ─── auditLog ─────────────────────────────────────────────────────────────────
// Enregistre une action client dans la table audit_logs.
// Usage dans une route :
//   await audit(res.locals.clientId, 'monitor.created', 'monitor', monitorId, req)

export async function audit(
  clientId:   string,
  action:     string,
  resource:   string,
  resourceId: string | undefined,
  req:        Request,
  meta:       Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.query(`
      INSERT INTO audit_logs (client_id, action, resource, resource_id, meta, ip)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      clientId, action, resource, resourceId ?? null,
      JSON.stringify(meta),
      req.ip ?? null,
    ])
  } catch (err) {
    // Ne jamais faire échouer une route à cause des audit logs
    logger.error('[Audit] Insert failed', { err })
  }
}
