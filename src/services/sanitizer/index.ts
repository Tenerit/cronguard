// ─── Sanitisation des logs avant envoi au LLM ───────────────────────────────
// Protège les données sensibles de tes clients
// Le modèle interne ne voit jamais de credentials, IPs privées, ou tokens

const PATTERNS: Array<{ name: string; regex: RegExp; replace: string }> = [
  // Clés Stripe / Resend / prefixed vendor keys (sk_live_, re_test_, pk_live_...)
  { name: 'vendor_key',   regex: /\b(sk|pk|rk|re)_(live|test|prod|staging)_[a-zA-Z0-9_-]{16,}\b/gi, replace: '[REDACTED_KEY]' },
  // Clés génériques : préfixe mot-clé suivi de = ou : puis long token
  { name: 'api_key',      regex: /\b(api[_-]?key|x-api-key|apikey|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[=:]\s*[a-zA-Z0-9_\-.]{20,}/gi, replace: '[REDACTED_KEY]' },
  // Bearer tokens
  { name: 'bearer',       regex: /\bbearer\s+[a-zA-Z0-9_\-.]{20,}/gi, replace: 'Bearer [REDACTED]' },
  // JWT
  { name: 'jwt',          regex: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replace: '[REDACTED_JWT]' },

  // Credentials dans les URLs
  { name: 'url_creds',    regex: /(https?:\/\/)[^:]+:[^@]+@/gi,                                           replace: '$1[REDACTED]@' },
  { name: 'postgres_url', regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/gi,                                    replace: 'postgres://[REDACTED]@' },
  { name: 'redis_url',    regex: /redis:\/\/[^:]+:[^@]+@/gi,                                              replace: 'redis://[REDACTED]@' },

  // Emails
  { name: 'email',        regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,                 replace: '[EMAIL]' },

  // IPs privées (ne pas exposer la topologie réseau interne)
  { name: 'private_ip',   regex: /\b(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g, replace: '[PRIVATE_IP]' },

  // Mots de passe inline
  { name: 'password',     regex: /(password|passwd|pwd|secret)\s*[:=]\s*\S+/gi,                           replace: '$1=[REDACTED]' },

  // AWS credentials
  { name: 'aws_key',    regex: /AKIA[0-9A-Z]{16}/g,              replace: '[AWS_KEY]' },
  // AWS secret : 40 chars base64 précédés d'un mot-clé AWS pour éviter les faux positifs
  { name: 'aws_secret', regex: /(?:aws.?secret|AWS_SECRET)[^\s]*\s*[:=]\s*[a-zA-Z0-9+/]{40}/gi, replace: '[AWS_SECRET]' },
]

export interface SanitizeResult {
  clean: string
  redactedCount: number
  patterns: string[]
}

export function sanitizeLogs(raw: string): SanitizeResult {
  let clean = raw
  let redactedCount = 0
  const patternsHit: string[] = []

  // Tronque les logs trop longs (protège contre les injections massives)
  const MAX_LOG_LENGTH = 3000
  if (clean.length > MAX_LOG_LENGTH) {
    clean = clean.slice(0, MAX_LOG_LENGTH) + '\n[...log truncated]'
  }

  for (const { name, regex, replace } of PATTERNS) {
    const before = clean
    clean = clean.replace(regex, replace)
    if (clean !== before) {
      patternsHit.push(name)
      redactedCount++
    }
  }

  return { clean, redactedCount, patterns: patternsHit }
}

// Génère un hash stable pour la déduplication
export function hashError(jobName: string, logs: string): string {
  // Hash simple basé sur les 200 premiers chars du log sanitisé
  const key = `${jobName}::${logs.slice(0, 200)}`
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}
