// Proposer CG_EXPECT à l'import d'une crontab (2026-11-12, essai pré-enregistré : eval/expect-suggest.ts).
// « Réussi mais n'a rien produit » est la panne silencieuse la plus chère ; encore faut-il savoir quel fichier
// attendre. Deux sources, comparées par l'essai : une règle (redirections, -O/-o, -f, tar cf) et le modèle local.
// Dans les deux cas, le code garde la main : un journal (.log, erreurs), /dev/null ou un chemin absent de la
// commande n'est jamais proposé.
import axios from 'axios'
import { llmHeaders } from './llm/analyzer'

// Dates calculées dans un nom de fichier (`date +%F`, $(date …), %d) → joker, pour que CG_EXPECT trouve le fichier du jour.
export function globDates(p: string): string {
  return p.replace(/`[^`]*`/g, '*').replace(/\$\([^)]*\)/g, '*').replace(/\\?%[A-Za-z]/g, '*').replace(/\*+(?:[-_.]?\*+)*/g, '*')
}

const LOGLIKE = /(^|[/._-])(logs?|err|errors?|stderr|stdout)([/._-]|$)|\.log$|^\/dev\/|^-$|^&\d$/i
const strip = (t: string) => t.replace(/^['"]|['"]$/g, '')

/** Vrai si le chemin proposé est un fichier produit plausible ET vient de la commande (rien d'inventé). */
export function acceptablePath(path: string, command: string): boolean {
  const p = path.trim()
  if (!p || p.length > 200 || LOGLIKE.test(p) || /\s/.test(p)) return false
  // Chaque morceau fixe (hors jokers) doit se lire dans la commande.
  return p.split('*').filter(Boolean).every(part => command.includes(part))
}

/** Règle : la cible d'une redirection de stdout, de -O/-o (wget, curl), de -f (pg_dump) ou de tar c…f. */
export function ruleExpect(command: string): string | null {
  const cands: string[] = []
  const tok = String.raw`("[^"]+"|'[^']+'|[^\s;|&]+)`
  for (const m of command.matchAll(new RegExp(String.raw`(?:^|[^0-9&2])(?:1?>>?|&>>?)\s*` + tok, 'g'))) cands.push(m[1])
  for (const m of command.matchAll(new RegExp(String.raw`\s-[Oo]\s+` + tok, 'g'))) cands.push(m[1])
  if (/\bpg_dump\b/.test(command)) for (const m of command.matchAll(new RegExp(String.raw`\s(?:-f|--file=?)\s*` + tok, 'g'))) cands.push(m[1])
  for (const m of command.matchAll(new RegExp(String.raw`\btar\s+-?[a-zA-Z]*c[a-zA-Z]*f\s+` + tok, 'g'))) cands.push(m[1])
  for (const c of cands) {
    const p = globDates(strip(c))
    if (acceptablePath(p, globDates(command))) return p
  }
  return null
}

const SYSTEM = `Tu lis UNE commande de crontab. Dis quel FICHIER ce job est censé produire : une sauvegarde, une archive, un export, un téléchargement, un rapport.
Ce n'est PAS un fichier produit : un journal (sortie ou erreurs redirigées vers un .log, error, cron.log), /dev/null, la sortie standard.
Si la commande ne nomme pas un tel fichier (script dont on ne voit pas ce qu'il écrit, appel d'URL, nettoyage), réponds null.
Recopie le chemin tel qu'il est écrit dans la commande ; remplace seulement une date calculée ($(date …), \`date …\`, %d) par *.
Réponds en JSON : {"raison": "une phrase", "fichier": "chemin" ou null}`

/** Modèle local, filtré par le code : null si rien de plausible, ou si le chemin n'est pas dans la commande. */
export async function aiExpect(command: string, timeout = 60_000): Promise<{ raw: unknown; path: string | null } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 150, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: command.slice(0, 500) }],
    }, { timeout, headers: llmHeaders() })
    const json = String(data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const raw = json ? JSON.parse(json[0]) as { fichier?: unknown } : {}
    const f = typeof raw.fichier === 'string' ? globDates(strip(raw.fichier.trim())) : ''
    return { raw, path: f && acceptablePath(f, globDates(command)) ? f : null }
  } catch { return null }
}
