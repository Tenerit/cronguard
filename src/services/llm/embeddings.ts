import axios from 'axios'
import { logger }     from '../../config/logger'
import { llmHeaders } from './analyzer'

// ─── Embeddings (mémoire d'incidents) ─────────────────────────────────────────
// Opt-in via MEMORY_ENABLED=true. Utilise un endpoint OpenAI-compatible /embeddings
// (Ollama `nomic-embed-text` par défaut → reste 100% local / no-egress ; ou cloud).
// Désactivé → renvoie null partout, comportement inchangé.

export function memoryEnabled(): boolean {
  // ON par défaut (le moat) : actif sauf si explicitement coupé via MEMORY_ENABLED=false.
  // Si le modèle d'embed est absent, embed() échoue proprement (null) → no-op, pas de casse.
  return process.env.MEMORY_ENABLED !== 'false'
}

function embedBaseUrl(): string {
  return process.env.EMBED_BASE_URL ?? process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1'
}

export async function embed(text: string): Promise<number[] | null> {
  if (!memoryEnabled()) return null
  const model = process.env.EMBED_MODEL ?? 'nomic-embed-text'
  try {
    const r = await axios.post(
      `${embedBaseUrl()}/embeddings`,
      { model, input: text.slice(0, 2000) },
      { timeout: 10_000, headers: llmHeaders() }
    )
    const v = r.data?.data?.[0]?.embedding
    return Array.isArray(v) && v.length ? v as number[] : null
  } catch (err) {
    logger.warn('[Memory] embed failed', { err: (err as Error).message })
    return null
  }
}

// Similarité cosinus entre deux vecteurs (0..1 pour des embeddings normalisés).
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}
