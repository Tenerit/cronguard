import { CronExpressionParser } from 'cron-parser'

// ─── Décision de retard ─────────────────────────────────────────────────────
// Avec schedule cron : on calcule la PROCHAINE exécution attendue après le
// dernier ping (ou la création) ; en retard si elle est dépassée de plus que
// la grace. Ce modèle (cf. Healthchecks) gère correctement les jobs fréquents.
// Sans schedule : grace simple depuis le dernier ping.
//
// Grâce apprise (2026-11-10) : le ping arrive à la FIN du job. Un job qui dure plus que sa grâce
// était déclaré « en retard » à chaque exécution, puis rétabli par son ping : fausse alerte.
// La grâce effective = max(grâce réglée, 1,2 × p95 des durées réussies récentes), dès 5 mesures.
// Jamais en dessous du réglage. Contrepartie : un job vraiment absent est signalé plus tard d'autant.
// LEARNED_GRACE=off revient à la grâce réglée seule.

export interface LateRow {
  schedule?: string | null
  grace_period?: number | null
  last_ping_at?: string | Date | null
  created_at?: string | Date | null
  p95_ms?: number | string | null     // p95 des durées réussies récentes (pg renvoie un numeric en texte)
  dur_n?: number | string | null      // nombre de mesures derrière ce p95
}

const LEARN_MIN_SAMPLES = 5
const LEARN_MAX_MS = 24 * 3600_000

export function graceMs(m: LateRow): number {
  const set = (m.grace_period ?? 300) * 1000
  if (process.env.LEARNED_GRACE === 'off' || Number(m.dur_n ?? 0) < LEARN_MIN_SAMPLES || !m.p95_ms) return set
  return Math.max(set, Math.min(Math.round(Number(m.p95_ms) * 1.2), LEARN_MAX_MS))
}

export function isLate(m: LateRow, now: number = Date.now()): boolean {
  const grace    = graceMs(m)
  const lastPing = m.last_ping_at ? new Date(m.last_ping_at).getTime() : null
  const base     = lastPing ?? (m.created_at ? new Date(m.created_at).getTime() : now)

  if (m.schedule) {
    try {
      const it  = CronExpressionParser.parse(m.schedule, { currentDate: new Date(base) })
      const due = it.next().toDate().getTime()
      // Grâce apprise plafonnée à l'intervalle du cron (mesuré, eval/grace-sim.ts) : au-delà, une exécution manquée
      // ne serait signalée qu'après l'heure de la suivante. La grâce réglée à la main n'est jamais réduite.
      const period = it.next().toDate().getTime() - due
      const set    = (m.grace_period ?? 300) * 1000
      return now > due + (grace > set ? Math.max(set, Math.min(grace, period)) : grace)
    } catch {
      // schedule invalide → fallback grace
    }
  }

  return base < now - grace
}
