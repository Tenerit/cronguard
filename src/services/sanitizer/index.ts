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
  // Pas un secret, et c'est le diagnostic : « (using password: NO) » de MySQL (booléen) et le prompt
  // « Enter password: » (le terminal n'affiche jamais la saisie). Les masquer cachait « mot de passe non transmis ».
  { name: 'password',     regex: /(?<!Enter )(password|passwd|pwd|secret)\s*[:=]\s*(?!(?:YES|NO)\b)\S+/gi, replace: '$1=[REDACTED]' },
  // Mot de passe collé à -p (mysql, mysqldump, mysqladmin) et sshpass -p : présents dans les commandes de cron.
  { name: 'mysql_p',      regex: /(\bmysql(?:dump|admin|import)?\b[^\n|;&]*?\s-p)(?!\s|\[REDACTED\])(?:'[^'\n]*'|"[^"\n]*"|\S+)/gi, replace: '$1[REDACTED]' },
  { name: 'sshpass',      regex: /(\bsshpass\s+-p\s*)(?!\[REDACTED\])\S+/gi,                                  replace: '$1[REDACTED]' },

  // AWS credentials
  { name: 'aws_key',    regex: /AKIA[0-9A-Z]{16}/g,              replace: '[AWS_KEY]' },
  // AWS secret : 40 chars base64 précédés d'un mot-clé AWS pour éviter les faux positifs
  { name: 'aws_secret', regex: /(?:aws.?secret|AWS_SECRET)[^\s]*\s*[:=]\s*[a-zA-Z0-9+/]{40}/gi, replace: '[AWS_SECRET]' },
]

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
  /\b((?:SK|AC)[0-9a-f]{32})\b/g,                       // Twilio (jeton entier ; AWS AKIA… : règle aws_key plus bas)
  /\/bot(\d{6,}:[A-Za-z0-9_-]{30,})/g,                                                            // Telegram
  /\b(?:AccountKey|SharedAccessKey|sig)=([A-Za-z0-9+/%=]{20,})/g,                                 // Azure
  /-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/g,               // clé privée
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]+)@/gi,                                             // scheme://user:pass@
  /\bAuthorization:\s*(?:Basic|Bearer|Token)\s+([A-Za-z0-9+/=._-]{8,})/gi,                      // en-tête HTTP
  /\bcurl\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:(\S+)/g,                                             // curl -u user:pass
  /(?:\b(?:docker|podman|helm|oras)\s+(?:registry\s+)?login\b[^\n]*?\s-p|--password)(?:\s+|=)(?![-$])['"]?([^\s'"]{4,})/g,   // login -p, --password
  /\b[A-Z][A-Z0-9_]*(?:PASS|PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|APIKEY|PRIVATE_KEY|AUTH)\s*=\s*['"]?([^\s'"]{4,})/g,  // VAR=…
  /"(?:api_?key|apiKey|token|secret|password|passwd|access_?token|client_?secret|private_?key(?:_?id)?)"\s*:\s*"([^"]{6,})"/gi,    // JSON
  /\baws_secret_access_key[\s=:]+([A-Za-z0-9/+]{40})/gi,                                          // AWS (secret)
  // Essai 3 (2026-11-11) : formats ratés à l'essai 2, ajoutés AVANT le jeu de test de l'essai 3.
  /\b(key-[0-9a-f]{32})\b/g,                                                                       // Mailgun
  /\b(do[por]_v1_[a-f0-9]{64})\b/g,                                                                // DigitalOcean
  /\b([MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,38})\b/g,                                          // Discord (bot)
  /https:\/\/([0-9a-f]{32})@[\w.-]*sentry\.io/g,                                                   // Sentry DSN
  /\b(whsec_[A-Za-z0-9]{24,})\b/g,                                                                 // Stripe (webhook)
  /\bldap\w+\b[^\n]*?\s-w\s+['"]?([^\s'"]{4,})/g,                                                  // ldapsearch -w
  /(?:^|\s)AUTH\s+(?!\[)([^\s]{6,})/g,                                                             // redis AUTH
  /define\(\s*['"][A-Z_]*(?:PASS|PASSWORD|SECRET|KEY|TOKEN)[A-Z_]*['"]\s*,\s*['"]([^'"]{4,})['"]/g,  // PHP define()
  /(?:office|outlook)\.com\/webhook(?:b2)?\/(\S+)/gi,                                              // Teams / Outlook
  /^\s*[a-z_]*(?:secret|password|passwd|token|api_?key)[a-z_]*\s*=\s*(\S{4,})/gim,                // fichier ini (rclone…)
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

  const apply = ({ name, regex, replace }: typeof PATTERNS[number]) => {
    const before = clean
    clean = clean.replace(regex, replace)
    if (clean !== before) {
      patternsHit.push(name)
      redactedCount++
    }
  }
  for (const p of PATTERNS) if (p.name !== 'email') apply(p)

  // Secrets par format connu (essai 2, 2026-11-11 : 0 faux sur 40 journaux propres) : seule la valeur est masquée,
  // le préfixe ou le nom de la variable restent visibles (« DB_PASS=[REDACTED] » garde le diagnostic).
  const beforeFormats = clean
  for (const v of formatSecrets(clean).sort((a, b) => b.length - a.length)) if (!v.includes('[REDACTED')) clean = clean.split(v).join('[REDACTED]')
  if (clean !== beforeFormats) { patternsHit.push('format_secret'); redactedCount++ }

  // E-mails EN DERNIER : avant, la règle mangeait « pL@cluster0.mongodb.net » dans mongodb+srv://app:Zx9-Qw8!pL@…
  // et laissait voir le début du mot de passe (fuite trouvée par le test des formats).
  for (const p of PATTERNS) if (p.name === 'email') apply(p)

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
    // durées et tailles : varient d'un run à l'autre pour la même panne. Un zéro reste
    // distinct (« wrote 0 bytes » : rien n'a été écrit, ce n'est pas la même panne).
    .replace(/\b(?:\d+h(?:\d+m)?(?:\d+s)?|\d+m\d+s)\b/g, '<dur>')
    .replace(/\b(?!0+(?:\.0+)?\s?[a-z])\d+(?:\.\d+)?\s?(?:ms|us|ns|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b/g, '<dur>')
    .replace(/\b(?!0+(?:\.0+)?\s?[a-z])\d+(?:\.\d+)?\s?(?:b|bytes?|kb|mb|gb|tb|kib|mib|gib|tib)\b/g, '<size>')
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
