import { db }     from '../../db'
import { logger } from '../../config/logger'
import { sanitizeLogs, fingerprintLogs } from '../sanitizer'
import { embed, cosine, memoryEnabled } from './embeddings'
import { parseDiagnosis } from './diagnosis'
import type { FewShotExample, ErrorCategory } from './analyzer'

// ─── Mémoire d'incidents (RAG few-shot par similarité) ────────────────────────
// Corpus = analyses VALIDÉES (feedback 👍). On embed l'empreinte d'erreur normalisée
// et on stocke le vecteur sur la ligne `analyses`. Au moment d'analyser une nouvelle
// panne, on rappelle les incidents validés les plus SIMILAIRES (cosine, tout le
// client — apprentissage cross-monitor) → meilleur few-shot que la simple récence.
// 100% local si EMBED pointe sur Ollama. Désactivé (MEMORY_ENABLED≠true) → no-op.

const SIM_THRESHOLD = 0.6   // en-dessous = pas assez pertinent pour servir d'exemple
const CANDIDATES    = 200   // fenêtre de candidats récents à scorer en mémoire

function fp(logs: string): string {
  return fingerprintLogs(sanitizeLogs(logs).clean).slice(0, 1000)
}

// Mémorise un incident validé : embed son empreinte → stocke sur analyses.embedding.
export async function rememberIncident(analysisId: string, logs: string): Promise<void> {
  if (!memoryEnabled()) return
  const vec = await embed(fp(logs))
  if (!vec) return
  try {
    await db.query(`UPDATE analyses SET embedding = $1 WHERE id = $2`, [vec, analysisId])
    logger.info('[Memory] incident remembered', { analysisId, dims: vec.length })
  } catch (err) {
    logger.warn('[Memory] remember failed', { err })
  }
}

// Rappelle les k incidents validés les plus similaires (cosine) comme few-shot.
export async function recallSimilar(clientId: string, logs: string, k = 2): Promise<FewShotExample[]> {
  if (!memoryEnabled()) return []
  const q = await embed(fp(logs))
  if (!q) return []
  try {
    const { rows } = await db.query(`
      SELECT a.diagnosis, a.embedding, p.output AS logs
      FROM analyses a
      JOIN pings p    ON p.id = a.ping_id
      JOIN monitors m ON m.id = a.monitor_id
      WHERE m.client_id = $1 AND a.user_feedback = 'positive' AND a.embedding IS NOT NULL
      ORDER BY a.created_at DESC LIMIT $2
    `, [clientId, CANDIDATES])

    return rows
      .map((r: { diagnosis: string; embedding: number[]; logs: string }) => ({ r, s: cosine(q, r.embedding) }))
      .filter((x: { s: number }) => x.s >= SIM_THRESHOLD)
      .sort((a: { s: number }, b: { s: number }) => b.s - a.s)
      .slice(0, k)
      .map(({ r }: { r: { diagnosis: string; logs: string } }) => {
        const d = parseDiagnosis(r.diagnosis, 'recall')
        return { logs: (r.logs ?? '').slice(0, 200), cause: d.cause, action: d.action,
                 category: (d.category ?? 'unknown') as ErrorCategory } as FewShotExample
      })
      .filter((x: FewShotExample) => !!x.cause && !!x.action)
  } catch (err) {
    logger.warn('[Memory] recall failed', { err })
    return []
  }
}
