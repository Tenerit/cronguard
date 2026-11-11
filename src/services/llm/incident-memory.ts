import { db }     from '../../db'
import { logger } from '../../config/logger'
import { sanitizeLogs, fingerprintLogs, hashError } from '../sanitizer'
import { embed, cosine, memoryEnabled } from './embeddings'
import { evidenceLines } from './evidence'
import type { AnalysisResult, FewShotExample, ErrorCategory } from './analyzer'

// ─── Mémoire d'incidents (RAG few-shot par similarité) ────────────────────────
// Corpus = analyses VALIDÉES (feedback 👍). On embed l'empreinte d'erreur normalisée
// et on stocke le vecteur sur la ligne `analyses`. Au moment d'analyser une nouvelle
// panne, on rappelle les incidents validés les plus SIMILAIRES (cosine, tout le
// client — apprentissage cross-monitor) → meilleur few-shot que la simple récence.
// 100% local si EMBED pointe sur Ollama. Désactivé (MEMORY_ENABLED≠true) → no-op.

const SIM_THRESHOLD = 0.6   // en-dessous = pas assez pertinent pour servir d'exemple
const CANDIDATES    = 200   // fenêtre de candidats récents à scorer en mémoire

export function fp(logs: string): string {   // texte embarqué : empreinte des logs masqués (aussi utilisé par eval/recall.ts)
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
      SELECT a.cause, COALESCE(a.verified_fix, a.action) AS action, a.category, a.embedding, p.output AS logs
      FROM analyses a
      JOIN pings p    ON p.id = a.ping_id
      JOIN monitors m ON m.id = a.monitor_id
      WHERE m.client_id = $1 AND a.user_feedback = 'positive' AND a.embedding IS NOT NULL
      ORDER BY a.created_at DESC LIMIT $2
    `, [clientId, CANDIDATES])

    return rows
      .map((r: { cause: string; action: string; category: string; embedding: number[]; logs: string }) => ({ r, s: cosine(q, r.embedding) }))
      .filter((x: { s: number }) => x.s >= SIM_THRESHOLD)
      .sort((a: { s: number }, b: { s: number }) => b.s - a.s)
      .slice(0, k)
      .map(({ r }: { r: { cause: string; action: string; category: string; logs: string } }) => (
        { logs: (r.logs ?? '').slice(0, 200), cause: r.cause, action: r.action,
          category: (r.category ?? 'unknown') as ErrorCategory } as FewShotExample
      ))
      .filter((x: FewShotExample) => !!x.cause && !!x.action)
  } catch (err) {
    logger.warn('[Memory] recall failed', { err })
    return []
  }
}

// Vrai seulement si CETTE erreur (même empreinte) a déjà été analysée sur ce monitor dans les 7 jours.
// Sans log, rien ne prouve que deux échecs sont la même erreur.
export async function sameErrorRecently(monitorId: string, jobName: string, logs: string): Promise<boolean> {
  if (!logs.trim()) return false
  const { rows } = await db.query(`
    SELECT 1 FROM analyses
    WHERE monitor_id=$1 AND error_hash=$2 AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 1
  `, [monitorId, hashError(jobName, sanitizeLogs(logs).clean)])
  return rows.length > 0
}

/** Signature d'une panne : sa ligne d'erreur décisive, normalisée (horodatages, PID, tailles…), SANS le
 *  nom du job. Deux jobs qui tombent sur la même erreur ont la même signature. */
export function errorSignature(cleanLogs: string): string | null {
  const line = evidenceLines(cleanLogs, '', 1)[0]
  return line ? fingerprintLogs(line).trim().slice(0, 200) || null : null
}

const SELECT_FIX = `SELECT a.cause, a.verified_fix, a.fix_verified_at, a.severity, a.category, a.prevention, a.data_impact, a.fix_minutes, a.checks`

// Même panne sur ce monitor avec une correction confirmée : on la ressert telle quelle, sans appeler
// le modèle, qui pourrait la déformer. Sans log, rien ne prouve que c'est la même panne.
// Sinon (shared) : même signature sur UN AUTRE job du même client, corrigée par l'équipe. Ressortie en
// confiance moyenne et nommée : la même ligne d'erreur peut avoir une autre cause sur un autre job.
// L'appelant ne la demande que si aucune source déterministe (fiche, constat) ne répond déjà.
export async function recallVerifiedFix(
  monitorId: string, jobName: string, logs: string, correlatedMonitors?: string[], opts: { shared?: boolean } = {},
): Promise<AnalysisResult | null> {
  if (!logs.trim()) return null
  const clean = sanitizeLogs(logs).clean
  const { rows: [own] } = await db.query(`${SELECT_FIX}
    FROM analyses a
    WHERE a.monitor_id=$1 AND a.error_hash=$2 AND a.verified_fix IS NOT NULL
    ORDER BY a.fix_verified_at DESC LIMIT 1
  `, [monitorId, hashError(jobName, clean)])
  const sig = !own && opts.shared ? errorSignature(clean) : null
  const r = own ?? (sig ? (await db.query(`${SELECT_FIX}, m.name AS from_job
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id
    WHERE a.signature=$2 AND a.verified_fix IS NOT NULL AND a.monitor_id <> $1
      AND m.client_id = (SELECT client_id FROM monitors WHERE id=$1)
    ORDER BY a.fix_verified_at DESC LIMIT 1
  `, [monitorId, sig])).rows[0] : undefined)
  if (!r) return null
  return {
    cause: r.cause, action: r.from_job ? `Correction vérifiée sur ${r.from_job} : ${r.verified_fix}` : r.verified_fix,
    prevention: r.prevention ?? '',
    checks: typeof r.checks === 'string' ? JSON.parse(r.checks) : (r.checks ?? []),
    severity: r.severity, category: r.category, confidence: r.from_job ? 'medium' : 'high', data_impact: r.data_impact, fix_minutes: r.fix_minutes,
    fromCache: false, model: 'memory', correlatedMonitors,
    verifiedFix: new Date(r.fix_verified_at).toISOString(),
  }
}
