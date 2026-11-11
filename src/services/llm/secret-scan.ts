// Rôle de l'IA envisagé (2026-11-11) : repérer les secrets que les règles du masquage (sanitizer) ratent, en PLUS
// d'elles (jamais à leur place) : l'IA ne peut qu'ajouter des masquages. Le code ne garde que des sous-chaînes
// recopiées EXACTEMENT du log (rien d'inventé) et assez longues. Comparé à une règle de code simple (baselineSecrets)
// avec des attentes fixées avant la mesure (eval/secrets.ts) : l'IA ne sert que si elle fait nettement mieux.
import axios from 'axios'
import { llmHeaders } from './analyzer'

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

// Essai 2 (2026-11-11) : règles par FORMAT connu (préfixes de fournisseurs, URL à mot de passe, options de ligne de
// commande, variables d'environnement nommées comme un secret), à la manière des outils spécialisés. Écrites et commitées
// AVANT le jeu de test de l'essai 2. Chaque règle capture la valeur seule (groupe 1) ou le jeton entier.
export const FORMAT_RULES: RegExp[] = [
  /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|glpat-[A-Za-z0-9_-]{20,})/g,          // GitHub, GitLab
  /\b(xox[abposr]-[A-Za-z0-9-]{10,})/g,                                                          // Slack (jetons)
  /hooks\.slack\.com\/services\/([A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+)/g,                    // Slack (webhook)
  /\b(AIza[0-9A-Za-z_-]{30,})/g,                                                                 // Google
  /\b(sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,})/g,                                          // OpenAI, Anthropic
  /\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g,                                              // SendGrid
  /\b(npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{30,})/g,                                            // npm, PyPI
  /\b(?:SK|AC)[0-9a-f]{32}\b|\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,                                        // Twilio, AWS (id)
  /\/bot(\d{6,}:[A-Za-z0-9_-]{30,})/g,                                                            // Telegram
  /\b(?:AccountKey|SharedAccessKey|sig)=([A-Za-z0-9+/%=]{20,})/g,                                 // Azure
  /-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/g,               // clé privée
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]+)@/gi,                                             // scheme://user:pass@
  /\bAuthorization:\s*(?:Basic|Bearer|Token)\s+([A-Za-z0-9+/=._-]{8,})/gi,                      // en-tête HTTP
  /\bcurl\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:(\S+)/g,                                             // curl -u user:pass
  /(?:\b(?:docker|podman|helm|oras)\s+(?:registry\s+)?login\b[^\n]*?\s-p|--password)(?:\s+|=)(?![-$])['"]?([^\s'"]{4,})/g,   // login -p, --password
  /\b[A-Z][A-Z0-9_]*(?:PASS|PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|APIKEY|PRIVATE_KEY|AUTH)\s*=\s*['"]?([^\s'"]{4,})/g,  // VAR=…
  /"(?:api_?key|apiKey|token|secret|password|passwd|access_?token|client_?secret|private_?key)"\s*:\s*"([^"]{6,})"/gi,    // JSON
  /\baws_secret_access_key[\s=:]+([A-Za-z0-9/+]{40})/gi,                                          // AWS (secret)
  /\b(?:token|apikey|api key|secret)\b[^\n\w]{0,3}\s*(?:provided:\s*)?([A-Za-z0-9_-]{24,})/gi,   // « token <long> »
]

/** Valeurs capturées par les règles de format. */
export function formatSecrets(log: string): string[] {
  const out = new Set<string>()
  for (const re of FORMAT_RULES) for (const m of log.matchAll(re)) {
    const v = (m.slice(1).find(Boolean) ?? m[0]).trim()
    if (v.length >= 4 && !/^\$\{?\w+\}?$/.test(v)) out.add(v)   // $VAR : une référence, pas un secret
  }
  return [...out]
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
