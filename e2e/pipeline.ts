/**
 * Test de bout en bout du pipeline de panne : vrais API + worker, vrais Postgres + Redis, vrais pings HTTP.
 * Seul le LLM est remplacé par un serveur local : on vérifie le pipeline, pas le modèle (voir eval/ pour ça).
 *
 * Isolé : base jetable `cronguard_e2e` sur le serveur de DATABASE_URL, Redis db 15, SMTP injoignable.
 * Usage : npm run test:e2e  (exige Postgres + Redis, et un utilisateur Postgres autorisé à créer une base)
 */
import 'dotenv/config'
import { spawn, execSync, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import { AddressInfo } from 'net'
import * as os from 'os'
import * as path from 'path'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { newApiKey, hashApiKey } from '../src/services/api-keys'

const E2E_DB   = 'cronguard_e2e'
const API_PORT = 3055
const LOGDIR   = fs.mkdtempSync(path.join(os.tmpdir(), 'cronguard-e2e-'))
const sleep    = (ms: number) => new Promise(r => setTimeout(r, ms))

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error('DATABASE_URL et REDIS_URL requis')
const adminUrl = process.env.DATABASE_URL
const dbUrl    = new URL(adminUrl); dbUrl.pathname = `/${E2E_DB}`
const redisUrl = new URL(process.env.REDIS_URL); redisUrl.pathname = '/15'

// ─── Faux LLM : compte les vraies demandes d'analyse et garde leur prompt ──────
const prompts: string[] = []
const fakeLlm = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    if (!req.url?.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return }
    const body = JSON.parse(Buffer.concat(chunks).toString())
    // max_tokens 1 = warm-up du worker, pas une analyse.
    if (body.max_tokens !== 1) prompts.push(body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? '')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      model: 'fake', usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { content: JSON.stringify({
        cause: 'cause de test', action: 'action de test', prevention: 'prevention de test', checks: ['check'],
        severity: 'medium', category: 'unknown', confidence: 'medium', data_impact: 'none', fix_minutes: 15,
      }) } }],
    }))
  })
})

// ─── Processus réels ───────────────────────────────────────────────────────────
const kids: ChildProcess[] = []
let pg: Pool | undefined
let redis: Redis | undefined
function start(name: string, file: string, llmPort: number) {
  const out = fs.openSync(path.join(LOGDIR, `${name}.log`), 'w')
  kids.push(spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', file], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', out, out],
    env: {
      ...process.env,
      DATABASE_URL: dbUrl.toString(), REDIS_URL: redisUrl.toString(), PORT: String(API_PORT),
      LLM_BASE_URL: `http://127.0.0.1:${llmPort}/v1`, LLM_API_KEY: '', LLM_PROVIDER: '',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', STRIPE_SECRET_KEY: '', APP_URL: `http://localhost:${API_PORT}`,
    },
  }))
}
function stop(kid: ChildProcess) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${kid.pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-kid.pid!, 'SIGKILL')
  } catch { /* déjà arrêté */ }
}

async function dropDb() {
  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`)
  await admin.end()
}

const results: Array<{ name: string; ok: boolean; detail: string }> = []
const check = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }) }

async function main() {
  await dropDb()
  // Un run interrompu laisse son cache dans Redis (volume persistant) : on repart de zéro.
  const stale = new Redis(redisUrl.toString())
  await stale.flushdb()
  stale.disconnect()
  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`CREATE DATABASE ${E2E_DB}`)
  await admin.end()

  await new Promise<void>(r => fakeLlm.listen(0, '127.0.0.1', r))
  const llmPort = (fakeLlm.address() as AddressInfo).port

  start('api', 'src/api/index.ts', llmPort)
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${API_PORT}/health`)).status < 500) break } catch { /* démarrage */ }
    if (i > 90) throw new Error('API non démarrée')
    await sleep(1000)
  }
  start('worker', 'src/workers/analysis.worker.ts', llmPort)

  // Le DROP DATABASE final coupe ces connexions : sans ces handlers, Node planterait avant le rapport.
  pg = new Pool({ connectionString: dbUrl.toString() })
  pg.on('error', () => {})
  const db = pg
  // Comme l'app : la clé en clair n'existe que côté appelant, la base ne garde que son empreinte.
  const addClient = async (email: string) => {
    const api_key = newApiKey()
    const { rows: [c] } = await db.query(`INSERT INTO clients (email, api_key) VALUES ($1, $2) RETURNING id`, [email, hashApiKey(api_key)])
    return { id: c.id as string, api_key }
  }
  const client = await addClient('e2e@example.invalid')
  const { rows: [mon] } = await db.query(
    `INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'nightly-etl',300) RETURNING id, ping_key`, [client.id])
  redis = new Redis(redisUrl.toString())
  redis.on('error', () => {})
  const cache = redis

  async function fail(output?: string) {
    const count = async () => Number((await db.query(`SELECT COUNT(*) FROM analyses WHERE monitor_id=$1`, [mon.id])).rows[0].count)
    const before = await count(), firstPrompt = prompts.length
    const r = await fetch(`http://localhost:${API_PORT}/ping/${mon.ping_key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'fail', exit_code: 1, duration_ms: 5000, output }),
    })
    if (!r.ok) throw new Error(`ping refusé : HTTP ${r.status}`)
    for (let i = 0; i < 120; i++) {
      if (await count() > before) {
        await sleep(500)
        const { rows: [row] } = await db.query(
          `SELECT id, from_cache, severity, category, confidence, model_used, action, verified_fix FROM analyses WHERE monitor_id=$1 ORDER BY created_at DESC LIMIT 1`, [mon.id])
        const sent = prompts.slice(firstPrompt)
        return { ...row, llm: sent.length, recurring: sent.some(p => p.includes('Même erreur déjà vue')) }
      }
      await sleep(500)
    }
    throw new Error(`aucune analyse après 60 s pour : ${(output ?? '(sans log)').slice(0, 50)}`)
  }

  const disk = (d: string, s: string) => `pg_dump: FATAL: backup aborted after ${d}: no space left on device, needed ${s}\nexit status 1`
  const OOM  = 'Out of memory: Killed process (python)\nworker exited with signal 9'

  const a = await fail(disk('3630s', '512MB'))
  check('1re panne : appel LLM, sans cache', a.llm === 1 && a.from_cache === false, JSON.stringify(a))
  check('1re panne : pas récurrente', a.recurring === false)
  const alerts = await db.query(`SELECT 1 FROM alert_states WHERE monitor_id=$1`, [mon.id])
  check('1re panne : état d\'alerte créé après l\'analyse', alerts.rows.length === 1)

  const b = await fail(disk('3712s', '1.2 GB'))
  check('Même panne, autre durée et taille : servie par le cache', b.llm === 0 && b.from_cache === true, JSON.stringify(b))
  check('Panne récurrente servie par le cache : sévérité relevée à high', b.severity === 'high', b.severity)

  const c = await fail(OOM)
  check('Autre erreur, même monitor : appel LLM', c.llm === 1, JSON.stringify(c))
  check('Autre erreur, même monitor : pas récurrente', c.recurring === false)

  // Contrôle positif : sans lui, un sameErrorBefore toujours faux passerait le test précédent.
  for (const k of await cache.keys('analysis:*')) await cache.del(k)
  const d = await fail(OOM)
  check('Même erreur, cache vidé : appel LLM et récurrente', d.llm === 1 && d.recurring === true, JSON.stringify(d))

  const e = await fail(undefined)
  check('Échec sans log : aucun appel LLM, cause non inventée', e.llm === 0 && e.category === 'unknown' && e.confidence === 'low', JSON.stringify(e))

  const total = Number((await db.query(`SELECT COUNT(*) FROM analyses WHERE monitor_id=$1`, [mon.id])).rows[0].count)
  check('Une seule analyse par panne', total === 5, `${total} lignes`)

  // ─── Lignes de log liées : toujours recopiées des logs du ping ───────────────
  const listed = await (await fetch(`http://localhost:${API_PORT}/dashboard/analyses?limit=50`, { headers: { 'X-API-Key': client.api_key } })).json() as Array<{ evidence: string[]; ping_output: string | null }>
  const withEv = listed.filter(r => r.evidence?.length)
  check('Preuves : présentes sur les analyses avec logs', withEv.length > 0, `${withEv.length}/${listed.length}`)
  check('Preuves : chaque ligne vient des logs du ping', withEv.every(r => r.evidence.every(l => (r.ping_output ?? '').includes(l))))

  // ─── Clés API stockées en empreinte (v18) ───────────────────────────────────
  const get = (p: string, key: string) => fetch(`http://localhost:${API_PORT}${p}`, { headers: { 'X-API-Key': key } })
  const stored = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [client.id])).rows[0].api_key as string
  check('Clé : seule l\'empreinte est en base', stored.startsWith('sha256:') && !stored.includes(client.api_key), stored.slice(0, 12))
  check('Clé : l\'empreinte elle-même ne permet pas de se connecter', (await get('/monitors', stored)).status === 401)
  const legacyKey = 'cg_live_legacyplaintextkey0000000000'
  const { rows: [legacy] } = await db.query(`INSERT INTO clients (email, api_key) VALUES ('legacy@example.invalid', $1) RETURNING id`, [legacyKey])
  execSync('npx tsx src/db/migrations.ts', { env: { ...process.env, DATABASE_URL: dbUrl.toString() }, stdio: 'ignore' })
  const migrated = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [legacy.id])).rows[0].api_key as string
  check('Clé : migration v18 convertit une ancienne clé en clair', migrated === hashApiKey(legacyKey), migrated.slice(0, 12))
  check('Clé : l\'ancienne clé en clair marche toujours après migration', (await get('/monitors', legacyKey)).status === 200)
  execSync('npx tsx src/db/migrations.ts', { env: { ...process.env, DATABASE_URL: dbUrl.toString() }, stdio: 'ignore' })
  const twice = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [legacy.id])).rows[0].api_key
  check('Clé : migration idempotente (pas de double hash)', twice === migrated)

  // ─── Mémoire panne × cause × correction ─────────────────────────────────────
  const post = (p: string, key: string, body: unknown) => fetch(`http://localhost:${API_PORT}${p}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': key }, body: JSON.stringify(body) })

  const other = await addClient('other@example.invalid')
  const foreign = await post(`/monitors/analyses/${d.id}/fix`, other.api_key, { fix: 'correction d un autre client' })
  check('Correction : un autre client ne peut pas écrire', foreign.status === 404, String(foreign.status))
  const tooShort = await post(`/monitors/analyses/${d.id}/fix`, client.api_key, { fix: ' ' })
  check('Correction vide refusée', tooShort.status === 400, String(tooShort.status))

  const FIX = 'Limiter le worker a 4 Go avec --max-old-space-size=4096 et token sk_live_abcdefghijklmnopqrstuvwx'
  const saved = await post(`/monitors/analyses/${d.id}/fix`, client.api_key, { fix: FIX })
  const savedBody = await saved.json() as { verified_fix: string }
  check('Correction enregistrée', saved.status === 200, String(saved.status))
  check('Secret retiré de la correction', !savedBody.verified_fix.includes('sk_live_'), savedBody.verified_fix)

  const known = await fail(OOM)
  check('Même panne : correction resservie sans appel LLM', known.llm === 0 && known.model_used === 'memory' && known.action === savedBody.verified_fix, JSON.stringify(known))
  check('Même panne : correction marquée vérifiée', known.verified_fix === savedBody.verified_fix)

  const unrelated = await fail('TypeError: cannot read property of undefined at foo.js')
  check('Autre panne : correction non resservie', unrelated.model_used !== 'memory' && unrelated.llm === 1, JSON.stringify(unrelated))

  const nope = await post(`/monitors/analyses/${known.id}/feedback`, client.api_key, { feedback: 'negative' })
  check('👎 accepté', nope.status === 200, String(nope.status))
  const afterNo = await fail(OOM)
  check('Après 👎 : correction plus resservie', afterNo.model_used !== 'memory' && !afterNo.verified_fix, JSON.stringify(afterNo))

}

async function finish(fatal?: Error) {
  kids.forEach(stop)
  fakeLlm.close()
  await sleep(500)
  await pg?.end().catch(() => {})
  await redis?.flushdb().catch(() => {})
  redis?.disconnect()
  await dropDb().catch(e => console.error('Nettoyage Postgres échoué :', e.message))
  // Une erreur de connexion (AggregateError) n'a pas de message : sans repli, le rapport serait vide.
  if (fatal) results.push({ name: fatal.message || (fatal as NodeJS.ErrnoException).code || fatal.name, ok: false, detail: '' })
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`)
  const failed = results.filter(r => !r.ok).length
  if (failed) {
    for (const f of fs.readdirSync(LOGDIR)) {
      const lines = fs.readFileSync(path.join(LOGDIR, f), 'utf8').split('\n').filter(l => /error|failed/i.test(l)).slice(-15)
      console.log(`\n--- ${f} (erreurs) ---\n${lines.join('\n')}`)
    }
  }
  console.log(failed ? `\n${failed} échec(s)` : '\nTOUT OK')
  process.exit(failed ? 1 : 0)
}

const guard = setTimeout(() => finish(new Error('délai global de 5 min dépassé')), 300_000)
main().then(() => { clearTimeout(guard); return finish() }).catch(e => { clearTimeout(guard); return finish(e) })
