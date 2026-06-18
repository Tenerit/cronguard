import { logger } from '../../config/logger'

// Le diagnostic LLM est stocké en blob JSON dans analyses.diagnosis. Il était parsé
// par `JSON.parse(...)` à ~5 endroits, chacun avalant l'erreur en silence (`catch {}`)
// → un blob corrompu produisait une cause/action VIDE sans aucun signal.
//
// Ce helper centralise le parsing : échec = LOGUÉ (pas silencieux) + dégradation
// gracieuse (on garde le texte brut comme cause plutôt que rien). Un seul point à
// tester, un seul comportement. (La migration vers colonnes typées cause/action est
// l'étape suivante — elle touche le rendu dashboard, à faire avec vérif navigateur.)

export interface ParsedDiagnosis {
  cause:        string
  action:       string
  prevention?:  string
  category?:    string
  checks?:      string[]
  data_impact?: string
}

export function parseDiagnosis(raw: string | null | undefined, ctx?: string): ParsedDiagnosis {
  if (!raw) return { cause: '', action: '' }
  try {
    const d = JSON.parse(raw)
    return {
      cause:       typeof d.cause  === 'string' ? d.cause  : '',
      action:      typeof d.action === 'string' ? d.action : '',
      prevention:  typeof d.prevention === 'string' ? d.prevention : undefined,
      category:    typeof d.category   === 'string' ? d.category   : undefined,
      checks:      Array.isArray(d.checks) ? d.checks.filter((c: unknown) => typeof c === 'string') : undefined,
      data_impact: typeof d.data_impact === 'string' ? d.data_impact : undefined,
    }
  } catch {
    logger.warn('[Diagnosis] blob non-JSON — dégradation en texte brut', { ctx, sample: String(raw).slice(0, 120) })
    return { cause: String(raw).slice(0, 300), action: '' }
  }
}
