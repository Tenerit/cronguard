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
}

export async function unrecognizedFailures(clientId: string, days = 7, limit = 10): Promise<UnrecognizedFailure[]> {
  const { rows } = await db.query(`
    SELECT a.signature, COUNT(*)::int AS occurrences, ARRAY_AGG(DISTINCT m.name) AS jobs, MAX(a.created_at) AS last_seen,
           (ARRAY_AGG(a.cause ORDER BY a.created_at DESC))[1] AS cause,
           (ARRAY_AGG(a.verified_fix ORDER BY a.fix_verified_at DESC NULLS LAST))[1] AS verified_fix
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1 AND a.recognized_by IS NULL AND a.signature IS NOT NULL
      AND a.alert_type != 'slow' AND a.created_at > NOW() - make_interval(days => $2)
    GROUP BY a.signature
    ORDER BY COUNT(*) DESC, MAX(a.created_at) DESC
    LIMIT $3
  `, [clientId, days, limit])
  return rows.map(r => ({ signature: r.signature, occurrences: r.occurrences, jobs: r.jobs, lastSeen: new Date(r.last_seen).toISOString(),
    cause: r.cause, verifiedFix: r.verified_fix }))
}
