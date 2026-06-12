import { Request, Response, NextFunction } from 'express'
import { db } from '../../db'

// ─── ownsMonitor ─────────────────────────────────────────────────────────────
// Vérifie que le monitor :id appartient au client authentifié.
// Remplace les 5 blocs copy-pastés dans api/index.ts.
//
// Usage :
//   router.get('/:id', requireApiKey, ownsMonitor, handler)

export async function ownsMonitor(req: Request, res: Response, next: NextFunction) {
  const { rows: [row] } = await db.query(
    `SELECT id FROM monitors WHERE id = $1 AND client_id = $2`,
    [req.params.id, res.locals.clientId]
  )
  if (!row) return res.status(404).json({ error: 'Monitor not found' })
  next()
}
