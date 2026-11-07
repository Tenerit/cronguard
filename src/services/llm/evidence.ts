// Lignes de log qui appuient la cause annoncée, choisies par le code et non par le modèle :
// elles sont recopiées des logs, donc jamais inventées. Un 3B se trompe ; montrer « regardez,
// c'est là » permet de vérifier en un coup d'œil au lieu de faire confiance.
//
// Recouvrement de mots entre la cause et chaque ligne. Les mots longs sont comparés sur leurs
// 5 premières lettres, ce qui rapproche une cause en français de logs en anglais
// (« connexion refusée » ↔ « connection refused »). Les identifiants (5432, db-primary,
// pg_wal) pèsent double : ce sont eux qui désignent la bonne ligne.

const STOP = new Set([
  'les', 'des', 'une', 'est', 'pas', 'par', 'pour', 'dans', 'sur', 'avec', 'que', 'qui', 'aux', 'son', 'ses',
  'cette', 'ont', 'été', 'etre', 'plus', 'job', 'tache', 'erreur', 'error', 'the', 'and', 'for', 'with', 'from',
  'was', 'not', 'are', 'has', 'have', 'this', 'that', 'failed', 'echec', 'cause', 'probable', 'lors', 'due',
])

// Concepts de panne courants, FR et EN : une cause courte (« disque plein ») ne partage
// souvent aucun mot avec le log (« No space left on device »). Vocabulaire générique du
// métier, pas des fixtures : à étendre seulement avec des mots qu'un ops emploierait.
const CONCEPTS: Record<string, string[]> = {
  '#disk':    ['disqu', 'disk', 'space', 'espac', 'enospc', 'plein', 'full', 'quota'],
  '#memory':  ['memoi', 'memor', 'oom', 'killed', 'oomkiller', 'alloc', 'heap', 'rss'],
  '#timeout': ['delai', 'timeout', 'timed', 'expir', 'depas', 'deadline', 'statement_timeout'],
  '#denied':  ['refus', 'denie', 'acces', 'acces', 'access', 'forbi', 'unaut', 'autho', 'permi', '401', '403'],
  '#conn':    ['conne', 'econnrefused', 'econnreset', 'reset', 'joign', 'unrea'],
  '#dns':     ['dns', 'resol', 'enotfound', 'eai_again', 'hostn'],
  '#cert':    ['certi', 'tls', 'ssl', 'x509'],
  '#lock':    ['verro', 'lock', 'deadlock', 'inter', 'interblocage'],
  '#null':    ['null', 'undefined', 'nil', 'none', 'vide', 'empty', 'manqu', 'missi'],
  '#constr':  ['contr', 'const', 'violat', 'viole', 'duplic', 'uniqu'],
  '#except':  ['excep', 'unhan', 'rejec', 'typeerror', 'trace', 'panic'],
}
const CONCEPT_OF = new Map<string, string>()
for (const [c, ws] of Object.entries(CONCEPTS)) for (const w of ws) CONCEPT_OF.set(w, c)

const ERROR_LINE = /error|erreur|fatal|fail|exception|refused|denied|killed|timeout|no space|panic|cannot|unable|invalid|expired|deadlock/i

function terms(s: string): Map<string, number> {
  const out = new Map<string, number>()
  const words = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9_.:/-]+/)
  for (let w of words) {
    w = w.replace(/^[.:/-]+|[.:/-]+$/g, '')
    if (w.length < 3 || STOP.has(w)) continue
    const ident = /[0-9_]/.test(w) || /[a-z][.-][a-z0-9]/.test(w)
    const t = ident || w.length < 5 ? w : w.slice(0, 5)
    out.set(t, ident ? 2 : 1)
    const concept = CONCEPT_OF.get(t) ?? CONCEPT_OF.get(w)
    if (concept) out.set(concept, 1)
  }
  return out
}

export function evidenceLines(logs: string, cause: string, max = 2): string[] {
  const want = terms(cause)
  const seen = new Set<string>()
  const scored: Array<{ line: string; i: number; score: number }> = []
  logs.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line || seen.has(line)) return
    seen.add(line)
    let score = 0
    for (const [t, w] of terms(line)) if (want.has(t)) score += Math.max(w, want.get(t)!)
    if (score > 0) scored.push({ line, i, score })
  })
  if (!scored.length) {
    // Rien de commun avec la cause : la dernière ligne d'erreur reste la meilleure piste.
    const last = [...seen].reverse().find(l => ERROR_LINE.test(l))
    return last ? [last.slice(0, 240)] : []
  }
  return scored
    .sort((a, b) => b.score - a.score || b.i - a.i)   // à égalité : la plus tardive (plus près de l'échec)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(x => x.line.slice(0, 240))
}

// Pour les lignes d'analyse lues en base : la cause vit dans diagnosis (jsonb, ou texte selon le driver).
export function withEvidence<T extends { diagnosis?: unknown; ping_output?: string | null }>(row: T, sanitize: (s: string) => string): T & { evidence: string[] } {
  let d = row.diagnosis as { cause?: string } | string | null | undefined
  if (typeof d === 'string') { try { d = JSON.parse(d) } catch { d = null } }
  const cause = (d && typeof d === 'object' ? d.cause : '') ?? ''
  return { ...row, evidence: row.ping_output ? evidenceLines(sanitize(row.ping_output), cause) : [] }
}
