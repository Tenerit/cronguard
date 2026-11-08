// Retour humain sur une analyse : même effet depuis le dashboard (clé API) ou depuis un lien signé
// d'une alerte Teams / Slack / mail (2h40 d'astreinte, sans se connecter). C'est la boucle qui fait
// la valeur : une correction validée est resservie telle quelle si la même panne revient.
import { db } from '../db'
import { sanitizeLogs } from './sanitizer'
import { rememberIncident } from './llm/incident-memory'

export interface AnalysisRef {
  id: string; monitor_id: string; client_id: string; error_hash: string
  logs: string | null; job_name: string; diagnosis: unknown; verified_fix: string | null; user_feedback: string | null
}

/** L'analyse, et seulement si elle appartient à ce client (quand clientId est fourni). */
export async function findAnalysis(analysisId: string, clientId?: string): Promise<AnalysisRef | null> {
  const { rows: [a] } = await db.query(`
    SELECT a.id, a.monitor_id, m.client_id, a.error_hash, p.output AS logs, m.name AS job_name,
           a.diagnosis, a.verified_fix, a.user_feedback
    FROM analyses a
    JOIN monitors m   ON m.id = a.monitor_id
    LEFT JOIN pings p ON p.id = a.ping_id
    WHERE a.id = $1 AND ($2::uuid IS NULL OR m.client_id = $2)
  `, [analysisId, clientId ?? null])
  return a ?? null
}

export async function recordFeedback(a: AnalysisRef, feedback: 'positive' | 'negative'): Promise<void> {
  await db.query(`UPDATE analyses SET user_feedback = $2 WHERE id = $1`, [a.id, feedback])
  // 👎 : la correction mémorisée pour cette panne n'est plus fiable, elle ne doit plus être resservie.
  if (feedback === 'negative') {
    await db.query(`UPDATE analyses SET verified_fix = NULL, fix_verified_at = NULL WHERE monitor_id = $1 AND error_hash = $2`,
      [a.monitor_id, a.error_hash])
  }
  // 👍 → mémorise l'incident (embedding) pour le few-shot par similarité (no-op si MEMORY off)
  if (feedback === 'positive') await rememberIncident(a.id, a.logs ?? '')
}

/** Ce qui a réellement réglé la panne : prime sur l'action du modèle la prochaine fois. Renvoie le texte gardé. */
export async function recordFix(a: AnalysisRef, rawFix: string): Promise<string> {
  // Le texte repart ensuite dans le prompt et les alertes : un secret collé par erreur ne doit pas y aller.
  const fix = sanitizeLogs(rawFix).clean
  await db.query(`UPDATE analyses SET verified_fix = $2, fix_verified_at = NOW(), user_feedback = 'positive' WHERE id = $1`, [a.id, fix])
  await rememberIncident(a.id, a.logs ?? '')
  return fix
}
