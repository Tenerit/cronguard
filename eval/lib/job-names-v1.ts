// Nommage des jobs, ESSAI 1 (2026-11-11, mesure seulement : eval/job-names.ts) — l'IA décrivait aussi le planning,
// 12 des 22 erreurs venaient de là. Le produit utilise l'essai 2 (src/services/llm/job-names.ts).
import axios from 'axios'
import { llmHeaders } from '../../src/services/llm/analyzer'
import { inventedIdentifiers } from '../../src/services/llm/explain'

const SYSTEM = `Tu nommes des tâches planifiées (cron) pour un tableau de bord de supervision.
À partir de la ligne de crontab, donne :
- "nom" : 2 à 5 mots en kebab-case, en anglais, qui disent ce que fait la tâche (ex. "nightly-db-backup") ;
- "description" : une phrase courte en français qui dit ce que fait la tâche, sans rien supposer qui n'est pas dans la commande ;
- "critique" : true si la tâche sauvegarde, facture, synchronise ou transforme des données dont dépend l'activité, sinon false.
Réponds en JSON : {"nom": "...", "description": "...", "critique": false}`

export interface JobName { nom: string; description: string; critique: boolean }

/** Nommage proposé, filtré par les garde-fous du code ; null si rien d'acceptable. */
export async function nameJobRaw(line: string, timeout = 60_000): Promise<{ raw: Partial<JobName>; ok: JobName | null; invented: string[] } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 200, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: line.slice(0, 600) }],
    }, { timeout, headers: llmHeaders() })
    const json = String(data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const raw = (json ? JSON.parse(json[0]) : {}) as Partial<JobName>
    const nom = String(raw.nom ?? '').trim().toLowerCase(), description = String(raw.description ?? '').trim()
    const invented = inventedIdentifiers(description, line)
    const ok = /^[a-z0-9]+(?:-[a-z0-9]+){0,5}$/.test(nom) && nom.length <= 40 && description.length >= 10 && description.length <= 200 && !invented.length
      ? { nom, description, critique: raw.critique === true } : null
    return { raw, ok, invented }
  } catch { return null }
}
