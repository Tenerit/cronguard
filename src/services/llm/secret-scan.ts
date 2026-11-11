// Rôle de l'IA envisagé (2026-11-11) : repérer les secrets que les règles du masquage (sanitizer) ratent, en PLUS
// d'elles (jamais à leur place) : l'IA ne peut qu'ajouter des masquages. Le code ne garde que des sous-chaînes
// recopiées EXACTEMENT du log (rien d'inventé) et assez longues. Comparé à une règle de code simple (baselineSecrets)
// avec des attentes fixées avant la mesure (eval/secrets.ts) : l'IA ne sert que si elle fait nettement mieux.
import axios from 'axios'
import { llmHeaders } from './analyzer'
export { FORMAT_RULES, formatSecrets } from '../sanitizer'   // règles livrées dans le masquage (2026-11-11)

const SYSTEM = `Tu repères les secrets dans un journal technique : mots de passe, jetons, clés d'API, clés privées, identifiants de connexion.
Recopie chaque secret EXACTEMENT tel qu'il apparaît (la valeur seule, sans le nom de la variable).
Ne liste PAS : hash de commit, UUID, numéros de version, sommes de contrôle, chemins, noms d'hôte, adresses e-mail.
Réponds en JSON : {"secrets": ["..."]} (liste vide s'il n'y en a pas).`

/** Secrets proposés par le modèle, réduits aux sous-chaînes exactes du log (≥ 6 caractères). null = pas de réponse. */
export async function scanSecretsRaw(log: string, timeout = 60_000): Promise<{ raw: string[]; kept: string[] } | null> {
  try {
    const { data } = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_EXPLAIN_MODEL || process.env.LLM_MODEL || 'llama3.2:3b', max_tokens: 300, temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: log.slice(-3000) }],
    }, { timeout, headers: llmHeaders() })
    const json = String(data.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)
    const raw: string[] = json ? (JSON.parse(json[0]).secrets ?? []).filter((s: unknown) => typeof s === 'string') : []
    return { raw, kept: [...new Set(raw.map(s => s.trim()).filter(s => s.length >= 6 && log.includes(s)))] }
  } catch { return null }
}

const entropy = (s: string) => {
  const f = new Map<string, number>()
  for (const ch of s) f.set(ch, (f.get(ch) ?? 0) + 1)
  return [...f.values()].reduce((h, n) => h - (n / s.length) * Math.log2(n / s.length), 0)
}

/** Règle de code concurrente, fixée AVANT la mesure : (1) valeur juste après un mot-clé de secret ;
 *  (2) mot de passe d'une URL scheme://user:pass@ ; (3) jeton ≥ 20 caractères, lettres ET chiffres, entropie ≥ 3,8,
 *  qui n'est ni hexadécimal pur (hash, SHA) ni un UUID. */
export function baselineSecrets(log: string): string[] {
  const out = new Set<string>()
  for (const m of log.matchAll(/(?:token|key|pass(?:word|wd)?|pwd|secret|auth|credential)s?["']?\s*[:= ]\s*["']?([^\s"',;]{6,})/gi)) out.add(m[1])
  for (const m of log.matchAll(/[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{3,})@/gi)) out.add(m[1])
  for (const t of log.split(/[\s"'=,;()<>]+/)) {
    if (t.length < 20 || !/\d/.test(t) || !/[a-z]/i.test(t) || /^[0-9a-f]+$/i.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) continue
    if (entropy(t) >= 3.8) out.add(t)
  }
  return [...out]
}
