// Rôle de l'IA (2026-11-11) : à l'import d'une crontab, un nom lisible, un rôle d'une phrase et un drapeau « critique »
// pour chaque job. Le code garde la main : il écrit le planning (schedule-text.ts), n'accepte qu'un nom kebab-case et
// rejette un rôle qui parle de fréquence ou invente un identifiant. Essai 2 (eval/job-names-2.ts) : affichage juste 90 %.
// L'essai 1, où l'IA décrivait aussi le planning (74 %), est gardé pour la mesure dans eval/lib/job-names-v1.ts.
import axios from 'axios'
import { llmHeaders, llmEnabled, isAnthropic } from './analyzer'
import { sanitizeLogs } from '../sanitizer'
import { scheduleText } from '../schedule-text'
import { inventedIdentifiers } from './explain'


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


/** À l'import d'une crontab : planning écrit par le code, nom + rôle proposés par l'IA (essai 2 : affichage juste 90 %,
 *  5,6 s par job — au-dessus des 5 s visés, accepté par le fondateur pour un import fait une fois). Sans modèle
 *  d'explication déclaré : name null, le nom du code reste. La commande est masquée avant d'aller au modèle. */
export async function suggestJobName(command: string, schedule?: string): Promise<{ name: string | null; role: string | null; critical: boolean | null; when: string | null }> {
  const when = schedule ? scheduleText(schedule) : null
  if (!process.env.LLM_EXPLAIN_MODEL || !llmEnabled() || isAnthropic()) return { name: null, role: null, critical: null, when }
  const r = await nameJobRaw2(sanitizeLogs(command).clean)
  return { name: r?.nom ?? null, role: r?.role ?? null, critical: r ? r.critique : null, when }
}
