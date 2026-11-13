// Boucle d'apprentissage : les pannes qu'aucune source déterministe (fiche, constat, code, mémoire)
// n'a reconnues, regroupées par signature (ligne d'erreur décisive normalisée, tous jobs confondus).
// Celles que l'équipe a déjà corrigées (✏️ depuis l'alerte) sont des FICHES CANDIDATES : la panne,
// sa ligne et la correction réelle — à relire avant d'en faire une fiche partagée.
import { db } from '../db'

export interface UnrecognizedFailure {
  signature:   string
  occurrences: number
  jobs:        string[]
  lastSeen:    string
  cause:       string | null      // la dernière cause affichée (modèle ou « non établie »)
  verifiedFix: string | null      // la correction saisie par l'équipe, s'il y en a une
  analysisId:  string | null      // l'analyse corrigée la plus récente : base du brouillon de fiche d'équipe
}

/** Ce que la boucle rapporte (2026-11-13) : pannes reconnues grâce à l'équipe (fiche d'équipe, correction déjà
 *  validée) contre pannes encore inconnues, sur la période. Les alertes « job lent » ne comptent pas. */
export async function learningStats(clientId: string, days = 30): Promise<{ learned: number; unknown: number; days: number }> {
  const { rows: [r] } = await db.query(`
    SELECT COUNT(*) FILTER (WHERE a.recognized_by LIKE 'team-%' OR a.recognized_by = 'memory')::int AS learned,
           COUNT(*) FILTER (WHERE a.recognized_by IS NULL)::int AS unknown
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1 AND a.alert_type != 'slow' AND a.created_at > NOW() - make_interval(days => $2)
  `, [clientId, days])
  return { learned: r?.learned ?? 0, unknown: r?.unknown ?? 0, days }
}

export async function unrecognizedFailures(clientId: string, days = 7, limit = 10): Promise<UnrecognizedFailure[]> {
  const { rows } = await db.query(`
    SELECT a.signature, COUNT(*)::int AS occurrences, ARRAY_AGG(DISTINCT m.name) AS jobs, MAX(a.created_at) AS last_seen,
           (ARRAY_AGG(a.cause ORDER BY a.created_at DESC))[1] AS cause,
           (ARRAY_AGG(a.verified_fix ORDER BY a.fix_verified_at DESC NULLS LAST))[1] AS verified_fix,
           (ARRAY_AGG(a.id ORDER BY a.fix_verified_at DESC NULLS LAST))[1] AS analysis_id
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1 AND a.recognized_by IS NULL AND a.signature IS NOT NULL
      AND a.alert_type != 'slow' AND a.created_at > NOW() - make_interval(days => $2)
      -- Déjà transformée en fiche d'équipe active : plus une panne à traiter.
      AND NOT EXISTS (SELECT 1 FROM team_fixes tf JOIN analyses a2 ON a2.id = tf.source_analysis
                       WHERE tf.client_id = $1 AND tf.active AND a2.signature = a.signature)
    GROUP BY a.signature
    ORDER BY COUNT(*) DESC, MAX(a.created_at) DESC
    LIMIT $3
  `, [clientId, days, limit])
  return rows.map(r => ({ signature: r.signature, occurrences: r.occurrences, jobs: r.jobs, lastSeen: new Date(r.last_seen).toISOString(),
    cause: r.cause, verifiedFix: r.verified_fix, analysisId: r.analysis_id ?? null }))
}
