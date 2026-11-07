import { Request, Response, NextFunction } from 'express'
import { db }     from '../../db'
import { logger } from '../../config/logger'

export type Role = 'viewer' | 'member' | 'admin' | 'owner'

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }

export function hasRole(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

// Gate d'authentification. Clé API d'abord ; à défaut, SSO forward-auth (si activé).
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // En-tête seulement : une clé en query string finit dans les logs de proxy et l'historique.
  const key = req.headers['x-api-key'] as string

  // Pas de clé → tenter le SSO par reverse-proxy de confiance (opt-in, voir sso.ts)
  if (!key) {
    const { ssoEnabled, ssoEmail, resolveSsoUser } = await import('./sso')
    if (ssoEnabled()) {
      const email = ssoEmail(req)
      if (email) {
        const id = await resolveSsoUser(email)
        if (id) {
          res.locals.clientId = id.clientId
          res.locals.plan     = id.plan
          res.locals.role     = id.role
          res.locals.email    = id.email
          res.locals.authVia  = 'sso'
          return next()
        }
        return res.status(403).json({ error: 'SSO identity not authorized' })
      }
    }
    return res.status(401).json({ error: 'Missing X-API-Key header' })
  }

  try {
    // 1. Owner key (clients.api_key)
    const { rows: owners } = await db.query(
      `SELECT id, plan FROM clients WHERE api_key = $1`, [key]
    )
    if (owners.length) {
      res.locals.clientId = owners[0].id
      res.locals.plan     = owners[0].plan
      res.locals.role     = 'owner' as Role
      return next()
    }

    // 2. Team member key (team_members.api_key)
    const { rows: members } = await db.query(`
      SELECT tm.client_id, tm.role, c.plan
      FROM team_members tm
      JOIN clients c ON c.id = tm.client_id
      WHERE tm.api_key = $1
    `, [key])
    if (members.length) {
      res.locals.clientId = members[0].client_id
      res.locals.plan     = members[0].plan
      res.locals.role     = members[0].role as Role
      return next()
    }

    return res.status(401).json({ error: 'Invalid API key' })
  } catch (err) {
    logger.error('[Auth] DB error', { err })
    return res.status(503).json({ error: 'Service temporarily unavailable' })
  }
}
