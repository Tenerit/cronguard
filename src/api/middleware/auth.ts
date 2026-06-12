import { Request, Response, NextFunction } from 'express'
import { db }     from '../../db'
import { logger } from '../../config/logger'

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = (req.headers['x-api-key'] ?? req.query.apiKey) as string
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' })

  try {
    const { rows } = await db.query(
      `SELECT id, plan FROM clients WHERE api_key = $1`, [key]
    )
    if (!rows.length) return res.status(401).json({ error: 'Invalid API key' })
    res.locals.clientId = rows[0].id
    res.locals.plan     = rows[0].plan
    next()
  } catch (err) {
    logger.error('[Auth] DB error', { err })
    return res.status(503).json({ error: 'Service temporarily unavailable' })
  }
}
