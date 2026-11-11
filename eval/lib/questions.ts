// Rôle de l'IA (2026-11-11) : QUAND LA CAUSE N'EST PAS ÉTABLIE, poser 2-3 questions qui guident l'enquête de l'équipe.
// L'IA n'affirme rien : une question à côté coûte 2 secondes, une cause fausse envoie l'équipe sur une mauvaise piste.
// Garde-fous dans le code : chaque question finit par « ? », cite un élément RÉEL des faits (chemin, commande, code,
// message), n'invente aucun identifiant, et n'affirme pas de cause déguisée (« c'est dû à… », « la cause est… »).
//
// Attentes fixées AVANT la mesure (eval/questions.ts, pannes sans cause établie de tous les jeux étiquetés) :
//   ≥ 1 question acceptée dans ≥ 70 % des cas · questions brutes sans identifiant inventé ≥ 95 % ·
//   une question acceptée qui pointe la vraie cause ou la bonne vérification (regex de la grille) dans ≥ 30 % des cas ·
//   relecture humaine de 20 cas : cause affirmée en douce ≤ 10 %, utile ≥ 70 % · médiane ≤ 20 s (hors alerte, en différé).
// RÉSULTAT (2026-11-11, eval/archive/QUESTIONS.md) : 97 % avec question, 99 % sans invention, 8,3 s, MAIS pointe la
// cause 19 % (≥ 30 %) et utiles ~5/20 (≥ 70 %) : questions génériques (« quel est le chemin du fichier ? »). ÉCHEC →
// NON BRANCHÉ (seule l'éval l'appelle). Défaut connu : les en-têtes des faits (« Commande ») servent d'ancre.
import axios from 'axios'
import { llmHeaders, isAnthropic, llmEnabled } from '../../src/services/llm/analyzer'
import { inventedIdentifiers } from '../../src/services/llm/explain'

const SYSTEM = `Tu aides un technicien à enquêter sur l'échec d'une tâche planifiée dont la cause n'est PAS établie.
À partir UNIQUEMENT des lignes d'erreur et des faits fournis, pose 2 ou 3 questions courtes qui l'aident à trouver la cause lui-même.
Chaque question cite un élément précis des faits : un chemin, un nom de commande, un code ou un message d'erreur, recopié à l'identique.
N'affirme aucune cause. N'invente aucun chemin, commande ou option absent des faits.
Écris en français. Réponds en JSON : {"questions": ["...?", "...?"]}`

const ASSERTS = /\b(la cause est|c'est (dû|du|lié) à|est dû à|est due à|parce que|car le|the cause is|because)\b/i
const STOP = new Set(['est-ce', 'quelle', 'quelles', 'quels', 'avez-vous', 'pouvez-vous', 'vérifier', 'vérifié', 'depuis', 'pendant',
  'toujours', 'lorsque', 'comment', 'pourquoi', 'combien', 'quand', 'existe', 'existe-t-il', 'utilisé', 'utilise', 'cette', 'votre'])

/** Éléments des faits cités par la question (identifiant, code, nom de commande, mot du message). */
export function anchors(question: string, facts: string): string[] {
  const known = facts.toLowerCase()
  return [...new Set((question.match(/[\w./:@-]{4,}/g) ?? []).map(w => w.toLowerCase().replace(/[.,;:]+$/, '')))]
    .filter(w => !STOP.has(w) && known.includes(w) && (/[\d_./:@-]/.test(w) || w.length >= 6))
}

/** Question acceptée par les garde-fous, sinon null. */
export function acceptQuestion(q: string, facts: string): string | null {
  const s = q.trim().replace(/\s+/g, ' ')
  if (s.length < 15 || s.length > 220 || !s.endsWith('?') || ASSERTS.test(s)) return null
  if (inventedIdentifiers(s, facts).length || !anchors(s, facts).length) return null
  return s
}

/** Faits donnés au modèle, et contre lesquels ses questions sont vérifiées. Bornés : rien de non borné n'entre. */
export function questionFacts(input: { command?: string; exitCode?: number; errorLines: string[]; context?: string }): string {
  return [input.command ? `Commande : ${input.command.slice(0, 300)}` : '', input.exitCode != null ? `Code de sortie : ${input.exitCode}` : '',
    `Lignes d'erreur :\n${input.errorLines.map(l => l.slice(0, 240)).slice(0, 8).join('\n')}`,
    input.context ? `Constaté sur la machine : ${input.context.slice(0, 600)}` : ''].filter(Boolean).join('\n')
}

/** Réponse brute et questions acceptées (l'éval mesure les deux). */
export async function questionsRaw(facts: string, timeout = 60_000): Promise<{ raw: string[]; accepted: string[] } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 260, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: facts }],
    }, { timeout, headers: llmHeaders() })
    const json = String(data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const raw: string[] = json ? (JSON.parse(json[0]).questions ?? []).filter((q: unknown) => typeof q === 'string').slice(0, 5) : []
    const accepted = [...new Set(raw.map(q => acceptQuestion(q, facts)).filter((q): q is string => !!q))].slice(0, 3)
    return { raw, accepted }
  } catch { return null }
}

/** Questions acceptées, ou [] (pas de modèle d'explication déclaré, ou aucune ne passe les garde-fous). */
export async function investigationQuestions(facts: string): Promise<string[]> {
  if (!process.env.LLM_EXPLAIN_MODEL || !llmEnabled() || isAnthropic()) return []
  return (await questionsRaw(facts))?.accepted ?? []
}
