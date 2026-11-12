import { db }     from '../../db'
import { logger } from '../../config/logger'

// ─── Deduplication des alertes ────────────────────────────────────────────────
// Règles :
//   - 1ère alerte : envoyée immédiatement
//   - Alerte répétée : envoyée seulement si cooldown écoulé (défaut 30min)
//   - Si acknowledgée : plus d'alertes jusqu'au prochain fail indépendant
//   - Si snoozée : silencieux jusqu'à snooze_until
//   - Retour à OK : état réinitialisé → prochain fail = nouvelle alerte

const DEFAULT_COOLDOWN_MIN = 30

export type AlertDecision = 'send' | 'skip' | 'acknowledged' | 'snoozed'

export interface AlertState {
  decision:    AlertDecision
  alertCount:  number
  firstFired:  Date
  isNew:       boolean
}

// ─── shouldAlert ──────────────────────────────────────────────────────────────
// Décide si une alerte doit être envoyée et met à jour l'état en DB.

export async function shouldAlert(
  monitorId: string,
  cooldownMinutes = DEFAULT_COOLDOWN_MIN
): Promise<AlertState> {

  const { rows: [existing] } = await db.query(`
    SELECT * FROM alert_states WHERE monitor_id = $1
  `, [monitorId])

  // ── Snooze actif ─────────────────────────────────────────────────────────
  if (existing?.snooze_until && new Date(existing.snooze_until) > new Date()) {
    logger.debug('[Alert] Snoozed', { monitorId })
    return { decision: 'snoozed', alertCount: existing.alert_count, firstFired: existing.first_fired, isNew: false }
  }

  // ── Acknowledgée ──────────────────────────────────────────────────────────
  if (existing?.status === 'acknowledged') {
    logger.debug('[Alert] Acknowledged, skipping', { monitorId })
    return { decision: 'acknowledged', alertCount: existing.alert_count, firstFired: existing.first_fired, isNew: false }
  }

  // ── Première alerte sur ce monitor ────────────────────────────────────────
  if (!existing) {
    await db.query(`
      INSERT INTO alert_states (monitor_id, status, alert_count, first_fired, last_alerted)
      VALUES ($1, 'firing', 1, NOW(), NOW())
    `, [monitorId])

    return { decision: 'send', alertCount: 1, firstFired: new Date(), isNew: true }
  }

  // ── Alerte répétée : cooldown écoulé ? ────────────────────────────────────
  const lastAlerted   = new Date(existing.last_alerted)
  const cooldownMs    = cooldownMinutes * 60 * 1000
  const cooldownPassed = Date.now() - lastAlerted.getTime() > cooldownMs

  if (!cooldownPassed) {
    logger.debug('[Alert] Cooldown active, skipping', {
      monitorId,
      nextAlert: new Date(lastAlerted.getTime() + cooldownMs).toISOString(),
    })
    return {
      decision:   'skip',
      alertCount: existing.alert_count,
      firstFired: existing.first_fired,
      isNew:      false,
    }
  }

  // Cooldown passé → envoie et incrémente le compteur
  const { rows: [updated] } = await db.query(`
    UPDATE alert_states
    SET last_alerted = NOW(),
        alert_count  = alert_count + 1,
        status       = 'firing'
    WHERE monitor_id = $1
    RETURNING alert_count, first_fired
  `, [monitorId])

  logger.info('[Alert] Repeated alert sent', {
    monitorId,
    count: updated.alert_count,
    since: updated.first_fired,
  })

  return {
    decision:   'send',
    alertCount: updated.alert_count,
    firstFired: updated.first_fired,
    isNew:      false,
  }
}

// ─── clearAlert — appelé quand le monitor repasse à OK ────────────────────────
// Retourne l'état effacé (ou null si aucun) pour permettre une notif de
// rétablissement uniquement si une alerte était réellement active.

export interface ClearedAlert {
  firstFired: Date
  alertCount: number
  wasFiring:  boolean   // true si firing/acknowledged (donc une alerte avait été envoyée)
}

export async function clearAlert(monitorId: string): Promise<ClearedAlert | null> {
  const { rows: [cleared] } = await db.query(`
    DELETE FROM alert_states WHERE monitor_id = $1
    RETURNING first_fired, status, alert_count
  `, [monitorId])
  if (!cleared) return null
  logger.debug('[Alert] State cleared (monitor OK)', { monitorId })
  return {
    firstFired: cleared.first_fired,
    alertCount: cleared.alert_count ?? 1,
    wasFiring:  cleared.status === 'firing' || cleared.status === 'acknowledged',
  }
}

// ─── acknowledgeAlert — silence jusqu'au prochain fail indépendant ────────────

export async function acknowledgeAlert(monitorId: string): Promise<void> {
  await db.query(`
    INSERT INTO alert_states (monitor_id, status)
    VALUES ($1, 'acknowledged')
    ON CONFLICT (monitor_id)
    DO UPDATE SET status = 'acknowledged'
  `, [monitorId])
  logger.info('[Alert] Acknowledged', { monitorId })
}

// ─── checkEscalations — appelé par le checker toutes les 60s ─────────────────
// Retourne les alertes firing non-ackées qui ont dépassé le délai d'escalade et
// n'ont pas encore été escaladées. Marque escalated_at pour éviter les répétitions.

export interface EscalationTarget {
  monitorId:   string
  clientId:    string
  jobName:     string
  env:         string
  firstFired:  Date
  alertCount:  number
  escalationEmail?:   string
  escalationWebhook?: string
  lang?:              'fr' | 'en' | null
  lastAnalysis?: {
    cause?:    string
    action?:   string
    severity?: string
    category?: string
  } | null
}

export async function checkEscalations(): Promise<EscalationTarget[]> {
  const { rows } = await db.query(`
    SELECT
      a.monitor_id,
      m.client_id,
      m.name       AS job_name,
      m.env,
      a.first_fired,
      a.alert_count,
      c.escalation_email,
      c.escalation_webhook,
      c.escalation_after_min,
      c.lang,
      (
        SELECT row_to_json(x) FROM (
          SELECT cause, action, category, severity FROM analyses
          WHERE monitor_id = m.id
          ORDER BY created_at DESC LIMIT 1
        ) x
      ) AS last_analysis
    FROM alert_states a
    JOIN monitors m ON m.id = a.monitor_id
    JOIN clients  c ON c.id = m.client_id
    WHERE a.status     NOT IN ('acknowledged', 'snoozed')
      AND a.escalated_at IS NULL
      AND (c.escalation_email IS NOT NULL OR c.escalation_webhook IS NOT NULL)
      AND a.first_fired < NOW() - (c.escalation_after_min || ' minutes')::INTERVAL
  `)

  if (rows.length === 0) return []

  // Marque en une requête pour ne pas ré-escalader
  const ids = rows.map((r: { monitor_id: string }) => r.monitor_id)
  await db.query(
    `UPDATE alert_states SET escalated_at = NOW() WHERE monitor_id = ANY($1)`,
    [ids]
  )

  return rows.map((r: {
    monitor_id: string; client_id: string; job_name: string; env: string
    first_fired: Date; alert_count: number
    escalation_email?: string; escalation_webhook?: string; lang?: 'fr' | 'en' | null
    last_analysis?: { cause?: string; action?: string; category?: string; severity?: string } | null
  }) => {
    const la = r.last_analysis
    const parsedAnalysis = la?.cause
      ? { cause: la.cause, action: la.action ?? '', category: la.category }
      : null
    return {
      monitorId:          r.monitor_id,
      clientId:           r.client_id,
      jobName:            r.job_name,
      env:                r.env,
      firstFired:         new Date(r.first_fired),
      alertCount:         r.alert_count,
      escalationEmail:    r.escalation_email,
      escalationWebhook:  r.escalation_webhook,
      lang:               r.lang,
      lastAnalysis:       parsedAnalysis
        ? { ...parsedAnalysis, severity: r.last_analysis?.severity }
        : null,
    }
  })
}

// ─── snoozeAlert — silence pendant N minutes ──────────────────────────────────

export async function snoozeAlert(monitorId: string, minutes: number): Promise<void> {
  const until = new Date(Date.now() + minutes * 60 * 1000)
  await db.query(`
    INSERT INTO alert_states (monitor_id, status, snooze_until)
    VALUES ($1, 'snoozed', $2)
    ON CONFLICT (monitor_id)
    DO UPDATE SET status = 'snoozed', snooze_until = $2
  `, [monitorId, until])
  logger.info('[Alert] Snoozed', { monitorId, until })
}
