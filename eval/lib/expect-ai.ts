// Rôle de l'IA essayé et NON adopté (2026-11-12, eval/expect-suggest.ts) : proposer la sortie attendue d'un job.
// Rappel 12/14 comme la règle corrigée, 5 s par job, modèle de 5 Go : rien de mesurable en plus. Gardé pour la mesure.
import axios from 'axios'
import { llmHeaders } from '../../src/services/llm/analyzer'
import { acceptablePath, globDates } from '../../src/services/expect-suggest'

const strip = (t: string) => t.replace(/^['"]|['"]$/g, '')

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
