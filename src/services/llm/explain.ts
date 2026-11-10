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
  // Ponctuation finale retirée (« /usr/local/bin. » en fin de phrase n'est pas un autre chemin) : faux positif de l'essai 3.
  return [...new Set((text.match(IDENTIFIER) ?? []).map(id => id.toLowerCase().replace(/[.,;:]+$/, '')))].filter(id => !known.includes(id))
}

const STOP = new Set(['dans', 'pour', 'avec', 'sous', 'cron', 'votre', 'vous', 'sont', 'mais', 'plus', 'cette', 'celui', 'celle',
  'autre', 'autres', 'leur', 'leurs', 'job', 'jobs', 'fichier', 'fichiers', 'service', 'utilisateur', 'commande', 'absent', 'absente', 'absents'])
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Possibilités listées par une cause « X : a, b, ou c » (vide si la cause n'en liste pas). */
export function alternatives(cause: string): string[] {
  if (!/\bou\b/i.test(cause)) return []
  const head = cause.includes(' : ') ? cause.slice(cause.indexOf(' : ') + 3) : cause
  const body = head.replace(/\([^)]*\)/g, ' ')   // les parenthèses donnent des exemples, pas des possibilités
  return body.split(/[,;]|\bou\b/i).map(p => p.trim()).filter(p => keyWords(p).length > 0)
}
const keyWords = (part: string) => norm(part).split(/[^a-z0-9_]+/).filter(w => w.length >= 4 && !STOP.has(w))

/** Essai 4 : chaque possibilité de la cause doit rester dans l'explication (au moins un de ses mots-clés, préfixe de 5 lettres). */
export function keepsAlternatives(cause: string, text: string): boolean {
  const t = norm(text)
  return alternatives(cause).every(p => keyWords(p).some(w => t.includes(w.slice(0, 5))))
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
  // Cause à plusieurs possibilités : consigne explicite de toutes les garder (vérifié ensuite par keepsAlternatives).
  const system = alternatives(a.cause).length
    ? SYSTEM + "\nLa cause liste plusieurs possibilités : cite-les TOUTES, sans en choisir une ni en écarter aucune."
    : SYSTEM
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 260, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
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

// Essai 4 (2026-11-10) : l'essai 3 tient la qualité (96 % fidèle, 96 % mécanisme gardé) mais ne couvre que 35 % des
// causes établies (les autres listent plusieurs possibilités). Les causes à possibilités sont maintenant expliquées,
// avec la consigne de toutes les citer, et le garde-fou keepsAlternatives rejette tout texte qui en perd une.
// Attentes fixées AVANT l'essai 4 (qwen2.5:7b) : couverture ≥ 50 % des causes établies (explication acceptée par les
// deux garde-fous), et sur les explications acceptées : mécanisme gardé ≥ 90 %, ≤ 3 phrases ; fidélité brute ≥ 95 %
// (sorties du modèle sans identifiant inventé) ; médiane ≤ 20 s.

/** Cause établie (fiche, fait constaté, correction vérifiée). */
export const established = (a: Pick<AnalysisResult, 'finding' | 'knownFix' | 'verifiedFix'>) => !!(a.finding || a.knownFix || a.verifiedFix)

/** Garde-fous sur un texte du modèle : assez long, rien d'inventé, aucune possibilité perdue. 3 phrases au plus. */
export function acceptExplanation(cause: string, r: { text: string; invented: string[] }): string | null {
  const text = capSentences(r.text)
  return text.length >= 20 && !r.invented.length && keepsAlternatives(cause, text) ? text.slice(0, 600) : null
}

/** Explication simple d'une analyse établie, ou null (pas établie, IA coupée, garde-fou). */
export async function explainAnalysis(a: AnalysisResult, cleanLogs: string, line?: string, timeout = 60_000): Promise<string | null> {
  if (!llmEnabled() || isAnthropic() || process.env.LLM_EXPLAIN === 'off') return null
  if (!established(a)) return null     // rien d'établi : on n'habille pas une incertitude
  const r = await explainRaw(a, cleanLogs, line, timeout)
  return r ? acceptExplanation(a.cause, r) : null
}
