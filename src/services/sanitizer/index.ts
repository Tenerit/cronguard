import { createHash } from 'crypto'

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

// ─── Empreinte d'erreur (cache fingerprint) ───────────────────────────────────
// Neutralise les jetons volatils (timestamps, PID, UUID, IP, n° de ligne, gros
// nombres) AVANT de hasher → un même bug rejoué avec un timestamp/PID différent
// produit la MÊME empreinte → cache hit au lieu d'un appel LLM redondant (~15s).
// On garde les mots-clés d'erreur et les codes courts (exit code, HTTP 429/500).
export function fingerprintLogs(logs: string): string {
  return logs
    .toLowerCase()
    // timestamps ISO + dates + heures
    .replace(/\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}:\d{2}(\.\d+)?(z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b\d{2}:\d{2}:\d{2}(\.\d+)?\b/g, '<ts>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    // uuids
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>')
    // adresses hex / pointeurs mémoire
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    // ip(:port)
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/g, '<ip>')
    // pid / process / thread / worker ids
    .replace(/\b(pid|process|thread|worker)([\s:#=]+)\d+/g, '$1$2<pid>')
    // n° de ligne:colonne dans les stacks (:123:45) + "line 123"
    .replace(/:\d+:\d+\b/g, ':<line>')
    .replace(/\bline\s+\d+/g, 'line <line>')
    // longues séquences de chiffres (compteurs, offsets) — garde les courts (codes)
    .replace(/\b\d{5,}\b/g, '<n>')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// Génère un hash stable pour la déduplication (cache). Basé sur l'empreinte
// normalisée (et non le log brut) + le nom du job. sha256 tronqué = collisions
// négligeables (l'ancien hash 32-bit en avait beaucoup).
export function hashError(jobName: string, logs: string): string {
  // Empreinte COMPLÈTE (sha256 absorbe n'importe quelle longueur). Tronquer le
  // fingerprint à 600c faisait collisionner deux erreurs distinctes partageant un
  // long préfixe commun (en-tête, bannière) → analyse périmée servie depuis le cache.
  // On ne tronque que la SORTIE du hash (24 hex = 96 bits).
  const fp = fingerprintLogs(logs)
  return createHash('sha256').update(`${jobName}::${fp}`).digest('hex').slice(0, 24)
}
