import { CronExpressionParser } from 'cron-parser'
import { db }     from '../db'
import { logger } from '../config/logger'

export interface MaintenanceWindow {
  id:          string
  clientId:    string
  monitorId:   string | null
  label:       string
  cronExpr:    string
  durationMin: number
  active:      boolean
}

// Retourne true si `now` tombe dans l'occurrence la plus récente de la fenêtre.
export function isWindowActive(cronExpr: string, durationMin: number, now: Date = new Date()): boolean {
  try {
    const prev = CronExpressionParser
      .parse(cronExpr, { currentDate: now })
      .prev().toDate()
    return now.getTime() - prev.getTime() < durationMin * 60_000
  } catch {
    logger.warn('[Maintenance] Invalid cron expression', { cronExpr })
    return false
  }
}

type WindowRow = {
  id: string; client_id: string; monitor_id: string | null
  label: string; cron_expr: string; duration_min: number; active: boolean
}

function toWindow(r: WindowRow): MaintenanceWindow {
  return { id: r.id, clientId: r.client_id, monitorId: r.monitor_id,
           label: r.label, cronExpr: r.cron_expr, durationMin: r.duration_min, active: r.active }
}

// Charge les fenêtres actives d'un client une fois par tick du checker.
export async function getActiveWindowsForClient(clientId: string): Promise<MaintenanceWindow[]> {
  const { rows } = await db.query(`
    SELECT id, client_id, monitor_id, label, cron_expr, duration_min, active
    FROM maintenance_windows WHERE client_id = $1 AND active = true
  `, [clientId])
  return rows.map(toWindow)
}

// Charge toutes les fenêtres actives (tous clients) en une requête — pour le checker.
// Retourne une Map clientId → fenêtres.
export async function getAllActiveWindows(): Promise<Map<string, MaintenanceWindow[]>> {
  const { rows } = await db.query(`
    SELECT id, client_id, monitor_id, label, cron_expr, duration_min, active
    FROM maintenance_windows WHERE active = true
  `)
  const map = new Map<string, MaintenanceWindow[]>()
  for (const r of rows as WindowRow[]) {
    const w = toWindow(r)
    const list = map.get(w.clientId) ?? []
    list.push(w)
    map.set(w.clientId, list)
  }
  return map
}

// Vérifie si un monitor spécifique est en fenêtre de maintenance à `now`.
// windows = résultat de getActiveWindowsForClient (pré-chargé pour éviter N+1).
export function isMonitorInMaintenance(
  monitorId: string,
  windows:   MaintenanceWindow[],
  now:       Date = new Date()
): boolean {
  for (const w of windows) {
    // S'applique si global (monitorId null) ou ciblé sur ce monitor
    if (w.monitorId !== null && w.monitorId !== monitorId) continue
    if (isWindowActive(w.cronExpr, w.durationMin, now)) return true
  }
  return false
}
