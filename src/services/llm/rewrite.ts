// Rôle de l'IA (2026-11-11, idée fondateur) : RÉÉCRIRE le compte rendu de correction écrit par l'équipe (✏️) pour qu'il
// soit lisible par n'importe qui, sans rien ajouter. Pas une déduction : le texte source est la vérité, le modèle le
// reformule. Garde-fous dans le code : aucun identifiant (chemin, option, fichier, nom_technique) inventé, AUCUN
// identifiant du texte d'origine perdu (une commande ou un chemin doit survivre mot pour mot), 3 phrases au plus.
// Sert au brouillon de fiche d'équipe : l'admin voit la réécriture ET le texte d'origine, et valide.
//
// Attentes fixées AVANT la mesure (eval/rewrite.ts, réponses acceptées du corpus StackExchange comme comptes rendus) :
//   réécritures acceptées par les garde-fous ≥ 70 % · sorties brutes sans identifiant inventé ≥ 95 % ·
//   plus courtes que l'original, médiane ≤ 60 mots · relecture humaine de 20 réécritures : sens déformé ≤ 10 %.
import axios from 'axios'
import { llmHeaders, isAnthropic, llmEnabled } from './analyzer'
import { inventedIdentifiers, capSentences } from './explain'

const SYSTEM = `Tu réécris le compte rendu d'une correction de panne, écrit par un technicien, pour qu'il soit clair pour n'importe quel membre de l'équipe.
Garde exactement le même sens et les mêmes étapes. N'ajoute rien : aucune cause, aucune étape, aucune commande, aucun chemin.
Recopie à l'identique chaque commande, chemin, option et nom de fichier du texte d'origine.
Écris en français, 1 à 3 phrases courtes, à l'impératif pour les actions.
Réponds en JSON : {"texte": "..."}`

/** Réponse brute + identifiants inventés et perdus (l'éval mesure les deux garde-fous). */
export async function rewriteRaw(fix: string, timeout = 60_000): Promise<{ text: string; invented: string[]; lost: string[] } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 260, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Compte rendu d'origine :\n${fix}` }],
    }, { timeout, headers: llmHeaders() })
    const raw: string = data.choices?.[0]?.message?.content ?? ''
    const json = raw.match(/\{[\s\S]*\}/)
    const text = json ? String(JSON.parse(json[0]).texte ?? '').trim() : ''
    return { text, invented: inventedIdentifiers(text, fix), lost: inventedIdentifiers(fix, text) }
  } catch { return null }
}

/** Réécriture acceptée par les garde-fous, sinon null (on garde alors le texte d'origine). */
export function acceptRewrite(r: { text: string; invented: string[]; lost: string[] }): string | null {
  const text = capSentences(r.text)
  return text.length >= 15 && !r.invented.length && !r.lost.length && !inventedIdentifiers(r.text, text).length ? text.slice(0, 600) : null
}

/** Compte rendu de l'équipe réécrit, ou null (pas de modèle d'explication déclaré, ou garde-fou). */
export async function rewriteFix(fix: string): Promise<string | null> {
  if (!process.env.LLM_EXPLAIN_MODEL || !llmEnabled() || isAnthropic() || fix.trim().length < 15) return null
  const r = await rewriteRaw(fix)
  return r ? acceptRewrite(r) : null
}
