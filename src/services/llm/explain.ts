// Rôle de l'IA n°1 (2026-11-10) : EXPLIQUER en langage simple une panne déjà diagnostiquée, pas la diagnostiquer.
// Mesuré : llama3.2:3b ne trouve pas une cause absente du log (0/78) mais sait reformuler. La cause vient d'une
// fiche ou d'un fait constaté ; le modèle la rend lisible pour un non-spécialiste (ce qui s'est passé, pourquoi,
// quoi faire). Garde-fou dans le code : toute explication qui cite un chemin, une option, un fichier ou un nom
// absent des faits est rejetée (on garde alors les faits seuls). Appelé APRÈS l'alerte : il ne la retarde jamais.
//
// Attentes fixées AVANT la mesure (eval/explain.ts, cas couverts des jeux lab + public à public6) :
//   1. fidélité : ≥ 95 % des explications passent le garde-fou (rien d'inventé) ;
//   2. pas de dérive : quand la cause est juste, l'explication garde le mécanisme dans ≥ 90 % des cas ;
//   3. lisible : médiane ≤ 60 mots, 3 phrases au plus ;
//   4. rapide : médiane ≤ 8 s sur CPU.
import axios from 'axios'
import { llmHeaders, isAnthropic, llmEnabled } from './analyzer'
import type { AnalysisResult } from './analyzer'

const IDENTIFIER = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|--[a-z][a-z-]+|(?:\/[\w.-]+){2,}|\b[\w-]+\.(?:conf|ya?ml|json|ini|sh|py|js|toml)\b/gi

/** Identifiants (chemins, options, fichiers, noms_avec_soulignés) de `text` absents des faits. */
export function inventedIdentifiers(text: string, facts: string): string[] {
  const known = facts.toLowerCase()
  return [...new Set((text.match(IDENTIFIER) ?? []).map(id => id.toLowerCase()))].filter(id => !known.includes(id))
}

const SYSTEM = `Tu expliques une panne DÉJÀ diagnostiquée à un opérateur qui n'est pas spécialiste.
Tu ne cherches pas la cause : elle est donnée et elle est vérifiée. Tu ne la changes pas, tu n'en proposes pas d'autre.
Écris 2 ou 3 phrases simples, sans jargon : ce qui s'est passé, pourquoi, ce qu'il faut faire.
N'ajoute aucune commande, aucun chemin, aucun nom de fichier ni aucune option qui ne figure pas dans les faits.
Réponds en JSON : {"explication": "..."}`

export function explainPrompt(a: Pick<AnalysisResult, 'cause' | 'action' | 'checks'>, line?: string): string {
  return [`Cause (vérifiée) : ${a.cause}`, `Action : ${a.action}`,
    a.checks?.length ? `Vérifications : ${a.checks.join(' ; ')}` : '', line ? `Ligne d'erreur : ${line}` : '']
    .filter(Boolean).join('\n')
}

/** Réponse brute du modèle + identifiants inventés (sert aussi à l'éval, qui mesure le garde-fou). */
export async function explainRaw(a: Pick<AnalysisResult, 'cause' | 'action' | 'checks'>, cleanLogs: string, line?: string, timeout = 30_000): Promise<{ text: string; invented: string[] } | null> {
  const user = explainPrompt(a, line)
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 220, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }, { timeout, headers: llmHeaders() })
    const raw: string = data.choices?.[0]?.message?.content ?? ''
    const json = raw.match(/\{[\s\S]*\}/)
    const text = json ? String(JSON.parse(json[0]).explication ?? '').trim() : ''
    return { text, invented: inventedIdentifiers(text, `${user}\n${cleanLogs}`) }
  } catch { return null }
}

// Essai 3 (2026-11-10) : essais 1 (3B) et 2 (qwen2.5:7b) gardaient une seule des alternatives quand la cause
// en liste plusieurs (« … ou proxy absent sous cron ») : le modèle recommençait à deviner. Règles en code :
//   · l'IA n'explique que les causes CERTAINES (un seul mécanisme) ; une cause à alternatives reste affichée telle quelle ;
//   · 3 phrases au plus (coupé par le code) ; modèle réglable à part (LLM_EXPLAIN_MODEL, essai : qwen2.5:7b).
// Attentes fixées AVANT l'essai 3 : fidélité ≥ 95 %, mécanisme gardé ≥ 90 %, ≤ 3 phrases, médiane ≤ 20 s
// (l'explication arrive après l'alerte), et au moins 50 % des causes établies expliquées (sinon rôle marginal).

/** Cause expliquable : établie (fiche, fait, correction vérifiée) ET à un seul mécanisme. */
export function explainable(a: Pick<AnalysisResult, 'cause' | 'finding' | 'knownFix' | 'verifiedFix'>): boolean {
  return !!(a.finding || a.knownFix || a.verifiedFix) && !/\bou\b/i.test(a.cause)
}

/** 3 phrases au plus. */
export function capSentences(text: string, max = 3): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text]
  return parts.slice(0, max).join('').trim()
}

/** Explication simple d'une analyse établie et certaine, ou null (incertaine, IA coupée, garde-fou). */
export async function explainAnalysis(a: AnalysisResult, cleanLogs: string, line?: string, timeout = 60_000): Promise<string | null> {
  if (!llmEnabled() || isAnthropic() || process.env.LLM_EXPLAIN === 'off') return null
  if (!explainable(a)) return null     // rien d'établi, ou plusieurs causes possibles : on n'en laisse pas choisir une
  const r = await explainRaw(a, cleanLogs, line, timeout)
  return r && r.text.length >= 20 && !r.invented.length ? capSentences(r.text).slice(0, 600) : null
}
