import { Router } from 'express'
import { z }      from 'zod'
import { db }     from '../../db'
import { asyncHandler }  from '../middleware/async-handler'
import { isWindowActive } from '../../services/maintenance'
import { audit }         from '../middleware/audit'

export const maintenanceRouter = Router()

const WindowSchema = z.object({
  label:        z.string().max(120).default(''),
  cron_expr:    z.string().min(1).max(100),
  duration_min: z.number().int().min(1).max(10080), // max 7 jours
  monitor_id:   z.string().uuid().optional().nullable(),
  active:       z.boolean().default(true),
})

// GET /maintenance-windows — liste toutes les fenêtres du client
maintenanceRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT mw.id, mw.label, mw.cron_expr, mw.duration_min, mw.monitor_id,
           mw.active, mw.created_at,
           mo.name AS monitor_name
    FROM maintenance_windows mw
    LEFT JOIN monitors mo ON mo.id = mw.monitor_id
    WHERE mw.client_id = $1
    ORDER BY mw.created_at DESC
  `, [res.locals.clientId])

  // Enrichit chaque fenêtre : active en ce moment ?
  const now = new Date()
  const enriched = rows.map((r: {
    id: string; label: string; cron_expr: string; duration_min: number
    monitor_id: string | null; active: boolean; created_at: string; monitor_name: string | null
  }) => ({
    ...r,
    active_now: r.active ? isWindowActive(r.cron_expr, r.duration_min, now) : false,
  }))

  res.json(enriched)
}))

// POST /maintenance-windows — crée une fenêtre
maintenanceRouter.post('/', asyncHandler(async (req, res) => {
  const parsed = WindowSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const d = parsed.data

  // Valide l'expression cron
  if (!isValidCron(d.cron_expr)) {
    return res.status(400).json({ error: 'invalid_cron', message: 'Expression cron invalide. Exemple : "0 2 * * 0" (tous les dimanches à 2h).' })
  }

  // Vérifie que monitor_id appartient bien au client
  if (d.monitor_id) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM monitors WHERE id = $1 AND client_id = $2`,
      [d.monitor_id, res.locals.clientId]
    )
    if (!rowCount) return res.status(404).json({ error: 'monitor_not_found' })
  }

  const { rows: [created] } = await db.query(`
    INSERT INTO maintenance_windows (client_id, monitor_id, label, cron_expr, duration_min, active)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, label, cron_expr, duration_min, monitor_id, active, created_at
  `, [res.locals.clientId, d.monitor_id ?? null, d.label, d.cron_expr, d.duration_min, d.active])

  await audit(res, 'maintenance.created', 'maintenance_window', created.id, { cron: d.cron_expr, monitor_id: d.monitor_id ?? null })
  res.status(201).json(created)
}))

// PATCH /maintenance-windows/:id — modifie une fenêtre
maintenanceRouter.patch('/:id', asyncHandler(async (req, res) => {
  const PatchSchema = WindowSchema.partial()
  const parsed = PatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const d = parsed.data
  if (d.cron_expr && !isValidCron(d.cron_expr)) {
    return res.status(400).json({ error: 'invalid_cron' })
  }

  const { rows: [updated], rowCount } = await db.query(`
    UPDATE maintenance_windows
    SET label        = COALESCE($3, label),
        cron_expr    = COALESCE($4, cron_expr),
        duration_min = COALESCE($5, duration_min),
        monitor_id   = CASE WHEN $6 THEN $7 ELSE monitor_id END,
        active       = COALESCE($8, active)
    WHERE id = $1 AND client_id = $2
    RETURNING id, label, cron_expr, duration_min, monitor_id, active, created_at
  `, [
    req.params.id,
    res.locals.clientId,
    d.label        ?? null,
    d.cron_expr    ?? null,
    d.duration_min ?? null,
    d.monitor_id !== undefined,
    d.monitor_id ?? null,
    d.active       ?? null,
  ])

  if (!rowCount) return res.status(404).json({ error: 'not_found' })
  res.json(updated)
}))

// DELETE /maintenance-windows/:id
maintenanceRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM maintenance_windows WHERE id = $1 AND client_id = $2`,  /* audited below */
    [req.params.id, res.locals.clientId]
  )
  if (!rowCount) return res.status(404).json({ error: 'not_found' })
  await audit(res, 'maintenance.deleted', 'maintenance_window', req.params.id)
  res.status(204).end()
}))

// Validation cron légère (5 champs séparés par des espaces)
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every(p => /^[\d*/,\-]+$/.test(p))
}
