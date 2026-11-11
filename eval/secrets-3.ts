/**
 * Secrets, essai 3 — règles par format SEULES (sans IA), jeu écrit APRÈS le commit des règles (442d120).
 * 25 types de secrets du catalogue des outils spécialisés, dont beaucoup absents des règles (mesure de la généralisation),
 * valeurs générées à l'exécution ; 40 textes de questions publiques (public5 à 7, champ « question »), jamais utilisés
 * pour les secrets, comme journaux propres.
 * Attentes fixées AVANT le run : rappel ≥ 80 % · textes propres masqués à tort ≤ 5 %.
 *   npx tsx eval/secrets-3.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sanitizeLogs } from '../src/services/sanitizer'

let seed = 31112026
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const pick = (set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('')
const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const gen: Record<string, (n: number) => string> = {
  a: n => pick(AL, n), h: n => pick('0123456789abcdef', n), b: n => pick(AL + '+/', n), d: n => pick('0123456789', n),
  p: () => pick(AL, 5) + pick('!_-#.', 1) + pick(AL, 4) + pick('0123456789', 2),
}
// Rapport : tout jeton mêlant lettres et chiffres devient « … » (les faux secrets ne doivent pas finir dans le dépôt).
const blunt = (l: string) => l.replace(/[A-Za-z0-9_\-.+/!#=:]{8,}/g, t => /\d/.test(t) && /[A-Za-z]/.test(t) ? '…' : t)

// ⟦x⟧ = texte fixe collé au secret ; {x:N} = secret généré.
const TEMPLATES = [
  '~/.netrc: machine github.com login ci password github⟦_pat_⟧{a:22}_{a:59}\nfatal: Authentication failed',
  'jira-sync: using ATATT3x{a:180}\nHTTP 401 Unauthorized',
  'huggingface_hub.utils._errors.HfHubHTTPError: 401 with token hf_{a:34}',
  'linear-export: LINEAR_KEY lin_api_{a:40} rejected',
  '> GET /api/v1/users HTTP/1.1\n> Authorization: SSWS 00{a:40}\n< HTTP/1.1 401',
  'newman run collection.json --env-var apikey=PMAK-{h:24}-{h:34}\nerror: 401',
  'fcm: sending with server key AAAA{a:7}:APA91b{a:134}\nInvalidRegistration',
  'docker: loading ~/.docker/config.json {"auths":{"registry.acme.io":{"auth":"{b:28}"}}}\nunauthorized',
  'kubectl: using kubeconfig user client-key-data: {b:64}\nerror: You must be logged in to the server',
  '-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n{b:64}\n-----END PGP PRIVATE KEY BLOCK-----\ngpg: decryption failed: No secret key',
  'grafana-backup: GRAFANA_SA glsa_{a:32}_{h:8} -> 401 Unauthorized',
  'twilio: client(account_sid=AC{h:32}, auth=SK{h:32}) failed: 20003',
  'shopify-sync: SHOPIFY_TOKEN=shpat_{h:32}\n401 Invalid API key or access token',
  '+ mysqldump --user=backup --password={p} shop > /bak/shop.sql\nmysqldump: Got error: 1045: Access denied',
  'ansible-playbook site.yml (ANSIBLE_VAULT_PASSWORD={p})\nERROR! Decryption failed',
  '+ mount -t cifs //nas/backup /mnt/nas -o username=backup,password={p}\nmount error(13): Permission denied',
  'slack socket mode: connecting with xapp-1-A{a:10}-{d:13}-{h:64}\ninvalid_auth',
  'gitlab-runner register --token glrt-{a:20}\nERROR: Verifying runner... is not valid',
  '> POST /_bulk HTTP/1.1\n> Authorization: ApiKey {b:60}\n< 401 security_exception',
  '~/.netrc: machine api.heroku.com login ci@acme.io password {h:8}-{h:4}-{h:4}-{h:4}-{h:12}\n !    Invalid credentials',
  'pip install -i https://ci:{p}@pypi.acme.io/simple acme-utils\nERROR: 401 Client Error',
  'sendgrid-mailer: SENDGRID_API_KEY=SG.{a:22}.{a:43} -> 403 Forbidden',
  'vault login -method=userpass username=ci password={p}\nError authenticating: permission denied',
  'redis-cli -a {p} --no-auth-warning PING\n(error) WRONGPASS invalid username-password pair',
  'supabase: SUPABASE_SERVICE_ROLE_KEY=sbp_{h:40}\nInvalid API key',
]

function render(tpl: string): { log: string; secrets: string[] } {
  const secrets: string[] = []
  const log = tpl.replace(/⟦([^⟧]+)⟧/g, '$1').replace(/\{([ahbdp])(?::(\d+))?\}/g, (_m, k: string, n: string) => {
    const v = gen[k](Number(n ?? 0)); secrets.push(v); return v })
  return { log, secrets }
}

const cases = TEMPLATES.map(render)
const clean: string[] = []
for (const f of ['public5-raw', 'public6-raw', 'public7-raw']) {
  for (const x of JSON.parse(readFileSync(join(__dirname, `${f}.json`), 'utf8')) as Array<{ question?: string }>)
    if ((x.question ?? '').length >= 200 && clean.length < 40) clean.push(x.question!.slice(0, 3000))
}
const detail: string[] = []
let hit = 0
for (const c of cases) {
  const out = sanitizeLogs(c.log).clean
  const ok = c.secrets.every(s => !out.includes(s))
  hit += +ok
  detail.push(`- ${ok ? '✓' : '✗'} ${c.log.split('\n')[0].slice(0, 90)}`)
}
let falsePos = 0
for (const l of clean) {
  const r = sanitizeLogs(l)
  if (r.patterns.includes('format_secret')) { falsePos++; detail.push(`- ⚠ masqué à tort (format) : ${l.split('\n').find(x => sanitizeLogs(x).patterns.includes('format_secret'))?.slice(0, 100)}`) }
}
const pct = (a: number, b: number) => Math.round(100 * a / Math.max(1, b))
const res = {
  cas: cases.length, propres: clean.length,
  rappel: `${pct(hit, cases.length)} % (attente ≥ 80 %)`,
  propres_masques_a_tort: `${pct(falsePos, clean.length)} % (attente ≤ 5 %)`,
}
console.log(res)
writeFileSync(join(__dirname, 'archive', 'SECRETS-3.md'), `# Secrets, essai 3 — règles par format seules (${new Date().toISOString().slice(0, 10)})\n\n` +
  Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Détail (jetons masqués)\n\n' + detail.map(blunt).join('\n') + '\n')
