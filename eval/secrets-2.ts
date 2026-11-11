/**
 * Secrets, essai 2 — règles par format (FORMAT_RULES, commitées AVANT ce jeu) contre l'IA en complément.
 * Jeu NEUF : 25 types de secrets du catalogue des outils spécialisés (pas seulement ceux que les règles couvrent),
 * valeurs générées à l'exécution ; 40 vrais journaux des jeux publics 2 à 7 (pas le corpus de réglage), sans secret.
 * Attentes fixées AVANT le run :
 *   - règles (masquage actuel + FORMAT_RULES) : rappel ≥ 80 %, journaux propres masqués à tort ≤ 5 % → livrées si remplies ;
 *   - IA en complément (règles + IA) : adoptée seulement si elle ajoute ≥ 10 points de rappel avec ≤ 10 % de propres
 *     masqués à tort (et médiane ≤ 10 s).
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/secrets-2.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sanitizeLogs } from '../src/services/sanitizer'
import { scanSecretsRaw, formatSecrets } from './lib/secret-scan'

let seed = 99172026
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
// Rapport : tout jeton mêlant lettres et chiffres devient « … » (les faux secrets ne doivent pas finir dans le dépôt).
const blunt = (l: string) => l.replace(/[A-Za-z0-9_\-.+/!#=:]{8,}/g, t => /\d/.test(t) && /[A-Za-z]/.test(t) ? '…' : t)
const pick = (set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('')
const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const gen: Record<string, (n: number) => string> = {
  a: n => pick(AL, n), h: n => pick('0123456789abcdef', n), b: n => pick(AL + '+/', n), d: n => pick('0123456789', n),
  p: () => pick(AL, 4) + pick('!_-#.', 1) + pick(AL, 5) + pick('0123456789', 2),
}
// ⟦x⟧ = texte collé au secret mais pas secret (préfixe de fournisseur) ; {x:N} = secret généré.
const TEMPLATES = [
  'remote: Invalid credentials\n+ git push https://oauth2:glp⟦at⟧-{a:20}@gitlab.acme.io/ops/infra.git',
  '[deploy] DIGITALOCEAN_ACCESS_TOKEN not used, falling back to doctl auth init -t dop_v1_{h:64}\nError: unable to authenticate you',
  'shopify-sync: GET /admin/api/2024-01/orders.json with X-Shopify-Access-Token: shp⟦at⟧_{h:32}\n401 Unauthorized',
  'vault: export VAULT_TOKEN=hvs.{a:24}\nError checking seal status: permission denied',
  'discord-bot: logging in with token M{a:23}.G{a:5}.{a:38}\ndiscord.errors.LoginFailure: Improper token has been passed.',
  'sentry_sdk: DSN https://{h:32}@o{d:6}.ingest.sentry.io/{d:7} rejected: 403',
  'mailgun: POST https://api.mailgun.net/v3/mg.acme.io/messages auth=api:key-{h:32}\nForbidden',
  '+ ldapsearch -x -H ldap://ldap.acme.local -D "cn=admin,dc=acme,dc=local" -w {p} -b "dc=acme,dc=local"\nldap_bind: Invalid credentials (49)',
  'redis-cli -h cache1 AUTH {p}\n(error) WRONGPASS invalid username-password pair or user is disabled',
  'java.sql.SQLException: Access denied for user \'etl\'@\'10.0.3.7\' url=jdbc:mysql://db1:3306/dwh?user=etl&password={p}',
  "PHP Fatal error: Uncaught PDOException in /var/www/config.php:4 (define('DB_PASSWORD', '{p}');)",
  'kubectl get secret app -o yaml\ndata:\n  password: {b:24}\nError from server (Forbidden): secrets "app" is forbidden',
  '+ wget --http-user=ci --http-password={p} https://nexus.acme.io/repository/raw/build.tar.gz\nHTTP request sent, awaiting response... 401 Unauthorized',
  'smtp: connecting to smtp://alerts:{p}@mail.acme.io:587 failed: 535 Authentication failed',
  'ftp-mirror: lftp ftp://mirror:{p}@ftp.acme.io/pub -e "mirror"\nAccess failed: 530 Login incorrect.',
  'datadog-agent: API Key invalid, DD_API_KEY={h:32}\nError: 403 Forbidden',
  'gcloud: loading service account {"type": "service_account", "private_key_id": "{h:40}", "client_email": "etl@acme.iam.gserviceaccount.com"}',
  'heroku: HEROKU_API_KEY={h:8}-{h:4}-{h:4}-{h:4}-{h:12}\n !    Invalid credentials provided.',
  'anthropic.AuthenticationError: invalid x-api-key sk-ant-api03-{a:80}',
  'pypi upload: twine upload -u __token__ -p pypi-{a:60} dist/*\nHTTPError: 403 Forbidden',
  'circleci: export CIRCLE_TOKEN={h:40}\ncurl -s https://circleci.com/api/v2/me -> 401',
  'stripe webhook: verifying signature with whsec_{a:32}\nNo signatures found matching the expected signature for payload',
  'db-backup: PGPASSFILE missing, using inline conn "host=db1 dbname=shop user=backup password={p}"\npg_dump: error: connection failed',
  'notify: posting to https://outlook.office.com/webhook/{h:8}-{h:4}-{h:4}-{h:4}-{h:12}@{h:8}-{h:4}/IncomingWebhook/{h:32}/{h:8} -> 400',
  'rclone: config dump\n[s3]\naccess_key_id = AKIA{a:16}\nsecret_access_key = {b:40}\nERROR : Failed to copy: AccessDenied',
]

function render(tpl: string): { log: string; secrets: string[] } {
  const secrets: string[] = []
  const log = tpl.replace(/⟦(\w+)⟧/g, '$1').replace(/\{([ahbdp])(?::(\d+))?\}/g, (_m, k: string, n: string) => {
    const v = gen[k](Number(n ?? 0)); secrets.push(v); return v })
  return { log, secrets }
}

;(async () => {
  const cases = TEMPLATES.map(render)
  const already = cases.filter(c => c.secrets.every(s => !sanitizeLogs(c.log).clean.includes(s))).length
  const clean: string[] = []
  for (const f of ['public2-raw', 'public3-raw', 'public4-raw', 'public5-raw', 'public6-raw', 'public7-raw']) {
    const j = JSON.parse(readFileSync(join(__dirname, `${f}.json`), 'utf8')) as Array<{ logs?: string }>
    for (const x of j) if ((x.logs ?? '').length >= 150 && clean.length < 40 + 0 * clean.length) clean.push(x.logs!.slice(-3000))
    if (clean.length >= 40) break
  }
  console.log(`cas : ${cases.length} (dont ${already} déjà entièrement masqués par le masquage actuel) · journaux propres : ${clean.length}`)

  const gone = (log: string, extra: string[], secrets: string[]) => {
    let s = sanitizeLogs(log).clean
    for (const x of [...extra].sort((a, b) => b.length - a.length)) s = s.split(x).join('[REDACTED]')
    return secrets.every(v => !s.includes(v))
  }
  const ms: number[] = []
  let rules = 0, both = 0
  const detail: string[] = []
  for (const c of cases) {
    const f = formatSecrets(c.log)
    const t0 = Date.now(); const r = await scanSecretsRaw(c.log, 120_000); ms.push(Date.now() - t0)
    const a = gone(c.log, f, c.secrets), b = gone(c.log, [...f, ...(r?.kept ?? [])], c.secrets)
    rules += +a; both += +b
    detail.push(`- règles ${a ? '✓' : '✗'} · règles+IA ${b ? '✓' : '✗'} — ${c.log.split('\n')[0].slice(0, 100)}`)
    process.stdout.write(a ? '.' : b ? '+' : 'x')
  }
  let rulesFalse = 0, aiFalse = 0
  for (const l of clean) {
    const f = formatSecrets(l)
    const t0 = Date.now(); const r = await scanSecretsRaw(l, 120_000); ms.push(Date.now() - t0)
    if (f.length) { rulesFalse++; detail.push(`- ⚠ règles masquent à tort : ${f.map(s => s.slice(0, 40)).join(' | ')}`) }
    const extra = (r?.kept ?? []).filter(s => !f.includes(s))
    if (f.length || extra.length) aiFalse++
    if (extra.length) detail.push(`- ⚠ IA masque à tort : ${extra.map(s => s.slice(0, 40)).join(' | ')}`)
    process.stdout.write(extra.length ? '!' : '.')
  }
  const pct = (a: number, b: number) => Math.round(100 * a / Math.max(1, b))
  const res = {
    regles_rappel: `${pct(rules, cases.length)} % (attente ≥ 80 %)`,
    regles_propres_masques_a_tort: `${pct(rulesFalse, clean.length)} % (attente ≤ 5 %)`,
    regles_plus_ia_rappel: `${pct(both, cases.length)} %`,
    apport_ia: `${pct(both, cases.length) - pct(rules, cases.length)} points (attente ≥ 10)`,
    regles_plus_ia_propres_masques_a_tort: `${pct(aiFalse, clean.length)} % (attente ≤ 10 %)`,
    latence_ia_mediane_s: `${([...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] / 1000).toFixed(1)} (attente ≤ 10)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'SECRETS-2.md'), `# Secrets, essai 2 — règles par format + IA en complément (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Détail (jetons masqués : faux secrets générés, pas à commiter en clair)\n\n' + detail.map(blunt).join('\n') + '\n')
})()
