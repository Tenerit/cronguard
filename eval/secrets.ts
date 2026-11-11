/**
 * Rôle de l'IA « secrets que les règles ratent » (eval/lib/secret-scan.ts) — attentes fixées AVANT le run :
 *   20 journaux contenant un secret dans un format que le masquage actuel rate (vérifié ci-dessous, sinon le cas est
 *   exclu) ; 30 vrais journaux du corpus sans secret.
 *   - IA : secrets entièrement masqués (règles + IA) ≥ 80 % · journaux propres avec ≥ 1 masquage à tort ≤ 15 % ·
 *     médiane ≤ 10 s ;
 *   - l'IA ne sert QUE si son rappel dépasse d'au moins 15 points celui de la règle de code (baselineSecrets), avec
 *     ≤ 15 % de journaux propres masqués à tort. Sinon : ajouter la règle de code au masquage, pas l'IA.
 * Les valeurs sont générées à l'exécution (graine fixe) : aucun faux secret écrit dans le dépôt.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/secrets.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sanitizeLogs } from '../src/services/sanitizer'
import { scanSecretsRaw, baselineSecrets } from './lib/secret-scan'

let seed = 20261111
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
// Rapport : tout jeton mêlant lettres et chiffres devient « … » (les faux secrets ne doivent pas finir dans le dépôt).
const blunt = (l: string) => l.replace(/[A-Za-z0-9_\-.+/!#=:]{8,}/g, t => /\d/.test(t) && /[A-Za-z]/.test(t) ? '…' : t)
const pick = (set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('')
const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const gen: Record<string, (n: number) => string> = {
  a: n => pick(AL, n), h: n => pick('0123456789abcdef', n), b: n => pick(AL + '+/', n), d: n => pick('0123456789', n),
  p: () => pick(AL, 5) + pick('!_-#', 1) + pick(AL, 4) + pick('0123456789', 3),
}

// {x:N} = secret généré (x = a alnum, h hex, b base64, d chiffres, p mot de passe), ⟨…⟩ = texte fixe collé au secret.
const TEMPLATES = [
  "+ git clone https://gh{p_}{a:36}@github.com/acme/app.git /srv/app\nfatal: repository 'https://github.com/acme/app.git/' not found",
  "2026-03-02 02:00:01 slack-notify: posting to #ops with token xoxb-{d:12}-{d:13}-{a:24}\nError: channel_not_found",
  "notify.sh: POST https://hooks.slack.com/services/T{a:8}/B{a:8}/{a:24} failed: HTTP 404 no_service",
  "geocode-sync: request https://maps.googleapis.com/maps/api/geocode/json?address=Paris&key=AI{za}{a:35}\nREQUEST_DENIED",
  "Loaded config: {\"apiKey\":\"{a:32}\",\"region\":\"eu-west-1\",\"timeout\":30}\nTypeError: Cannot read properties of undefined (reading 'bucket')",
  "+ mongodump --host db1 --username backup --password {p} --db shop --out /backup/2026-03-02\nFailed: error connecting to db server: server returned error on SASL authentication step",
  "+ curl -fsS -u admin:{p} https://jenkins.acme.local/job/nightly/build\ncurl: (22) The requested URL returned error: 403",
  "MongoServerSelectionError: connection <monitor> to mongodb+srv://app:{p}@cluster0.x1y2z.mongodb.net/prod closed",
  "Traceback (most recent call last):\nsqlalchemy.exc.OperationalError: (pymysql.err.OperationalError) (2003, \"Can't connect\") url=mysql://root:{p}@db:3306/shop",
  "celery worker: Cannot connect to amqp://guest:{p}@rabbit:5672//: [Errno 111] Connection refused.",
  "> GET /api/v2/export HTTP/1.1\n> Authorization: Basic {b:28}\n< HTTP/1.1 401 Unauthorized",
  "+ cat /home/deploy/.ssh/id_ed25519\n-----BEGIN OPENSSH PRIVATE KEY-----\n{b:70}\n-----END OPENSSH PRIVATE KEY-----\nPermission denied (publickey).",
  "npm ERR! code E401\nnpm ERR! Unable to authenticate, your authentication token seems to be invalid.\nnpm ERR! config: //registry.npmjs.org/:_authToken=npm_{a:36}",
  "openai.error.AuthenticationError: Incorrect API key provided: sk-proj-{a:40}. You can find your API key at https://platform.openai.com/account/api-keys.",
  "mailer: sending via SendGrid with SG.{a:22}.{a:43}\nError: Forbidden (403)",
  "azure-upload: using DefaultEndpointsProtocol=https;AccountName=acmebackup;AccountKey={b:86}==;EndpointSuffix=core.windows.net\nAuthorizationFailure",
  "Using deploy token {h:40} for registry.acme.io\nError response from daemon: unauthorized: authentication required",
  "telegram-alert: POST https://api.telegram.org/bot{d:10}:AA{a:33}/sendMessage -> 401 Unauthorized",
  "+ docker login -u ci -p {p} registry.acme.io\nError response from daemon: Get \"https://registry.acme.io/v2/\": unauthorized",
  "env dump before failure:\nAPP_ENV=production\nDB_HOST=db1\nDB_PASS={p}\nDB_NAME=shop\nfatal: password authentication failed for user \"shop\"",
  "+ aws configure set aws_secret_access_key {b:40}\n+ aws s3 cp /backup/db.gz s3://acme-backups/\nupload failed: An error occurred (SignatureDoesNotMatch)",
]
const FIXED: Record<string, string> = { '{p_}': 'p_', '{za}': 'za' }

function render(tpl: string): { log: string; secrets: string[] } {
  const secrets: string[] = []
  // Un secret = le jeton complet autour des générateurs (préfixe fixe compris) : on le reconstruit après génération.
  const log = tpl.replace(/\{(p_|za)\}/g, m => FIXED[m]).replace(/\{([ahbdp])(?::(\d+))?\}/g, (_m, k: string, n: string) => {
    const v = gen[k](Number(n ?? 0)); secrets.push(v); return v })
  return { log, secrets }
}

;(async () => {
  const cases = TEMPLATES.map(render).filter(c => c.secrets.some(s => sanitizeLogs(c.log).clean.includes(s)))
  const corpus: Array<{ logs: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
  const tok = (l: string) => (l.match(/[A-Za-z0-9+/=_\-.]{20,}/g) ?? []).some(t => /\d/.test(t) && /[a-zA-Z]/.test(t) && !t.includes('/'))
  const clean = [...corpus.filter(c => tok(c.logs)), ...corpus.filter(c => !tok(c.logs) && c.logs.length >= 150)].slice(0, 30).map(c => c.logs.slice(-3000))
  console.log(`cas avec secret raté par les règles : ${cases.length}/${TEMPLATES.length} · journaux propres : ${clean.length}`)

  const masked = (log: string, extra: string[], secrets: string[]) => {
    let s = sanitizeLogs(log).clean
    for (const x of extra) s = s.split(x).join('[REDACTED]')
    return secrets.every(v => !s.includes(v))
  }
  const ms: number[] = []
  let aiHit = 0, baseHit = 0
  const detail: string[] = []
  for (const c of cases) {
    const t0 = Date.now(); const r = await scanSecretsRaw(c.log, 120_000); ms.push(Date.now() - t0)
    const ai = masked(c.log, r?.kept ?? [], c.secrets), base = masked(c.log, baselineSecrets(c.log), c.secrets)
    aiHit += +ai; baseHit += +base
    detail.push(`- ${ai ? '✓' : '✗'} IA · ${base ? '✓' : '✗'} code — ${c.log.split('\n')[0].slice(0, 90)}${r?.kept.length ? `\n  IA : ${r.kept.length} valeur(s) proposée(s)` : ''}`)
    process.stdout.write(ai ? '.' : 'x')
  }
  let aiFalse = 0, baseFalse = 0
  for (const l of clean) {
    const t0 = Date.now(); const r = await scanSecretsRaw(l, 120_000); ms.push(Date.now() - t0)
    const b = baselineSecrets(l)
    if (r?.kept.length) { aiFalse++; detail.push(`- ⚠ IA masque à tort : ${r.kept.map(s => s.slice(0, 40)).join(' | ')}`) }
    if (b.length) { baseFalse++; detail.push(`- ⚠ code masque à tort : ${b.map(s => s.slice(0, 40)).join(' | ')}`) }
    process.stdout.write(r?.kept.length ? '!' : '.')
  }
  const pct = (a: number, b: number) => `${Math.round(100 * a / Math.max(1, b))} %`
  const res = {
    ia_rappel: `${pct(aiHit, cases.length)} (attente ≥ 80 %)`, code_rappel: pct(baseHit, cases.length),
    ia_propres_masques_a_tort: `${pct(aiFalse, clean.length)} (attente ≤ 15 %)`, code_propres_masques_a_tort: pct(baseFalse, clean.length),
    ecart_rappel_ia_moins_code: `${Math.round(100 * (aiHit - baseHit) / Math.max(1, cases.length))} points (attente ≥ 15)`,
    latence_mediane_s: `${([...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] / 1000).toFixed(1)} (attente ≤ 10)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'SECRETS.md'), `# Rôle IA — secrets que les règles ratent (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Détail (jetons masqués : faux secrets générés, pas à commiter en clair)\n\n' + detail.map(blunt).join('\n') + '\n')
})()
