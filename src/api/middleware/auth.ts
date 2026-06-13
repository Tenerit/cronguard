import { Request, Response, NextFunction } from 'express'
import { db }     from '../../db'
import { logger } from '../../config/logger'

export type Role = 'viewer' | 'member' | 'admin' | 'owner'

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }

export function hasRole(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = (req.headers['x-api-key'] ?? req.query.apiKey) as string
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' })

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
