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
      model: process.env.LLM_MODEL ?? 'llama3.2:3b', max_tokens: 220, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }, { timeout, headers: llmHeaders() })
    const raw: string = data.choices?.[0]?.message?.content ?? ''
    const json = raw.match(/\{[\s\S]*\}/)
    const text = json ? String(JSON.parse(json[0]).explication ?? '').trim() : ''
    return { text, invented: inventedIdentifiers(text, `${user}\n${cleanLogs}`) }
  } catch { return null }
}

/** Explication simple d'une analyse établie (fiche ou fait constaté), ou null (pas établie, IA coupée, garde-fou). */
export async function explainAnalysis(a: AnalysisResult, cleanLogs: string, line?: string, timeout = 30_000): Promise<string | null> {
  if (!llmEnabled() || isAnthropic() || process.env.LLM_EXPLAIN === 'off') return null
  if (!a.finding && !a.knownFix && !a.verifiedFix) return null     // rien d'établi : on n'habille pas une incertitude
  const r = await explainRaw(a, cleanLogs, line, timeout)
  return r && r.text.length >= 20 && !r.invented.length ? r.text.slice(0, 600) : null
}
