// Rôle de l'IA envisagé (2026-11-11) : à l'import d'une crontab, donner à chaque job un nom lisible, une description
// d'une phrase et un drapeau « critique » (sauvegarde, facturation, synchronisation de données). Le code garde la main :
// planning lu par le code, nom au format kebab-case, description sans identifiant absent de la commande. Comparé au
// nommage du code (cronguard-import.sh : premier exécutable de la commande) avec des attentes fixées avant (eval/job-names.ts).
import axios from 'axios'
import { llmHeaders } from './analyzer'
import { inventedIdentifiers } from './explain'

const SYSTEM = `Tu nommes des tâches planifiées (cron) pour un tableau de bord de supervision.
À partir de la ligne de crontab, donne :
- "nom" : 2 à 5 mots en kebab-case, en anglais, qui disent ce que fait la tâche (ex. "nightly-db-backup") ;
- "description" : une phrase courte en français qui dit ce que fait la tâche, sans rien supposer qui n'est pas dans la commande ;
- "critique" : true si la tâche sauvegarde, facture, synchronise ou transforme des données dont dépend l'activité, sinon false.
Réponds en JSON : {"nom": "...", "description": "...", "critique": false}`

export interface JobName { nom: string; description: string; critique: boolean }

// ─── Essai 2 : l'IA ne parle plus du planning (le code l'écrit : schedule-text.ts) ───────────────────────────────
const SYSTEM_2 = `Tu nommes une tâche planifiée (cron) pour un tableau de bord de supervision. On te donne SEULEMENT la commande.
- "nom" : 2 à 4 mots en kebab-case, en anglais, qui disent ce que fait la commande (ex. "mysql-backup", "renew-ssl-certs") ;
- "role" : une phrase courte en français qui dit ce que fait la commande ;
- "critique" : true si la tâche sauvegarde, facture, synchronise ou transforme des données dont dépend l'activité, sinon false.
Ne parle JAMAIS de fréquence ni d'heure. N'affirme rien qui ne se lit pas dans la commande (ne devine pas une base de données, un site ou un service non nommé).
Réponds en JSON : {"nom": "...", "role": "...", "critique": false}`
const WHEN_WORDS = /\b(daily|weekly|hourly|nightly|monthly|yearly|minutely|every|minutes?|hours?|quotidien\w*|hebdo\w*|mensuel\w*|chaque|toutes? les|tous les|minuit|matin|soir|nuit|jour|heure|semaine|mois)\b/i

/** Nom sans mot de fréquence (le code donne le planning) : « nightly-db-backup » → « db-backup ». */
export function stripWhen(nom: string): string {
  return nom.split('-').filter(w => !/^(daily|weekly|hourly|nightly|monthly|yearly|minutely|every|\d+min|minute|minutes|hour|hours|day)$/.test(w)).join('-')
}

/** Essai 2 : nom + rôle par l'IA (sans planning), filtrés par le code ; rôle rejeté s'il parle de fréquence ou invente. */
export async function nameJobRaw2(command: string, timeout = 60_000): Promise<{ raw: Record<string, unknown>; nom: string | null; role: string | null; critique: boolean } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 120, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_2 }, { role: 'user', content: command.slice(0, 500) }],
    }, { timeout, headers: llmHeaders() })
    const json = String(data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const raw = (json ? JSON.parse(json[0]) : {}) as Record<string, unknown>
    const nom = stripWhen(String(raw.nom ?? '').trim().toLowerCase())
    const role = String(raw.role ?? '').trim()
    return {
      raw,
      nom: /^[a-z0-9]+(?:-[a-z0-9]+){0,4}$/.test(nom) && nom.length <= 40 ? nom : null,
      role: role.length >= 10 && role.length <= 160 && !WHEN_WORDS.test(role) && !inventedIdentifiers(role, command).length ? role : null,
      critique: raw.critique === true,
    }
  } catch { return null }
}

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
