/**
 * Test de bout en bout du pipeline de panne : vrais API + worker, vrais Postgres + Redis, vrais pings HTTP.
 * Seul le LLM est remplacé par un serveur local : on vérifie le pipeline, pas le modèle (voir eval/ pour ça).
 *
 * Isolé : base jetable `cronguard_e2e` sur le serveur de DATABASE_URL, Redis db 15, SMTP injoignable.
 * Usage : npm run test:e2e  (exige Postgres + Redis, et un utilisateur Postgres autorisé à créer une base)
 */
import 'dotenv/config'
import { spawn, execSync, ChildProcess } from 'child_process'
import * as crypto from 'crypto'
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
      LLM_BASE_URL: `http://127.0.0.1:${llmPort}/v1`, LLM_API_KEY: '', LLM_PROVIDER: '', LLM_DEDUCTION: 'on',   // ce test couvre le chemin modèle + cache (désactivé par défaut)
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

  async function fail(output?: string, extra: Record<string, unknown> = {}, m: { id: string; ping_key: string } = mon) {
    const mon = m
    const count = async () => Number((await db.query(`SELECT COUNT(*) FROM analyses WHERE monitor_id=$1`, [mon.id])).rows[0].count)
    const before = await count(), firstPrompt = prompts.length
    const r = await fetch(`http://localhost:${API_PORT}/ping/${mon.ping_key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'fail', exit_code: 1, duration_ms: 5000, output, ...extra }),
    })
    if (!r.ok) throw new Error(`ping refusé : HTTP ${r.status}`)
    for (let i = 0; i < 120; i++) {
      if (await count() > before) {
        await sleep(500)
        const { rows: [row] } = await db.query(
          `SELECT id, from_cache, severity, category, confidence, model_used, cause, action, verified_fix, signature, recognized_by FROM analyses WHERE monitor_id=$1 ORDER BY created_at DESC LIMIT 1`, [mon.id])
        const sent = prompts.slice(firstPrompt)
        return { ...row, llm: sent.length, recurring: sent.some(p => p.includes('Même erreur déjà vue')) }
      }
      await sleep(500)
    }
    throw new Error(`aucune analyse après 60 s pour : ${(output ?? '(sans log)').slice(0, 50)}`)
  }

  // Pannes INCONNUES des fiches : ces contrôles testent le chemin modèle + cache (une fiche répondrait sans modèle).
  const disk = (d: string, s: string) => `ledger-sync: FATAL reconciliation drift after ${d}, delta ${s}\nexit status 1`
  const OOM  = 'invoice-exporter: unexpected checksum on batch\nworker exited with signal 9'
  const KNOWN = 'Out of memory: Killed process (python)\nworker exited with signal 9'

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

  // ─── Fiches d'abord : une panne connue répond sans appeler le modèle ─────────
  const f1 = await fail(KNOWN)
  check("Fiches d'abord : panne connue sans appel au modèle", f1.llm === 0 && f1.model_used === 'knowledge' && /mémoire/.test(String(f1.cause)), JSON.stringify(f1))
  const f2 = await fail(KNOWN)
  check("Fiches d'abord : la récurrence relève quand même la sévérité", f2.llm === 0 && f2.severity === 'high', f2.severity)

  const total = Number((await db.query(`SELECT COUNT(*) FROM analyses WHERE monitor_id=$1`, [mon.id])).rows[0].count)
  check('Une seule analyse par panne', total === 7, `${total} lignes`)

  // ─── Lignes de log liées : toujours recopiées des logs du ping ───────────────
  const listed = await (await fetch(`http://localhost:${API_PORT}/dashboard/analyses?limit=50`, { headers: { 'X-API-Key': client.api_key } })).json() as Array<{ evidence: string[]; ping_output: string | null }>
  const withEv = listed.filter(r => r.evidence?.length)
  check('Preuves : présentes sur les analyses avec logs', withEv.length > 0, `${withEv.length}/${listed.length}`)
  check('Pack : champ known_fix présent sur chaque analyse', listed.every(r => 'known_fix' in r))
  check('Preuves : chaque ligne vient des logs du ping', withEv.every(r => r.evidence.every(l => (r.ping_output ?? '').includes(l))))

  // ─── Clés API stockées en empreinte (v18) ───────────────────────────────────
  const get = (p: string, key: string) => fetch(`http://localhost:${API_PORT}${p}`, { headers: { 'X-API-Key': key } })
  const stored = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [client.id])).rows[0].api_key as string
  check('Clé : seule l\'empreinte est en base', stored.startsWith('sha256:') && !stored.includes(client.api_key), stored.slice(0, 12))
  check('Clé : l\'empreinte elle-même ne permet pas de se connecter', (await get('/monitors', stored)).status === 401)
  const legacyKey = 'cg_live_legacyplaintextkey0000000000'
  const { rows: [legacy] } = await db.query(`INSERT INTO clients (email, api_key) VALUES ('legacy@example.invalid', $1) RETURNING id`, [legacyKey])
  await db.query(`DELETE FROM migration_markers WHERE name LIKE 'schema_v%'`)   // simule une base d'une version plus ancienne
  execSync('npx tsx src/db/migrations.ts', { env: { ...process.env, DATABASE_URL: dbUrl.toString() }, stdio: 'ignore' })
  const migrated = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [legacy.id])).rows[0].api_key as string
  check('Clé : migration v18 convertit une ancienne clé en clair', migrated === hashApiKey(legacyKey), migrated.slice(0, 12))
  check('Clé : l\'ancienne clé en clair marche toujours après migration', (await get('/monitors', legacyKey)).status === 200)
  await db.query(`DELETE FROM migration_markers WHERE name LIKE 'schema_v%'`)   // simule une base d'une version plus ancienne
  execSync('npx tsx src/db/migrations.ts', { env: { ...process.env, DATABASE_URL: dbUrl.toString() }, stdio: 'ignore' })
  const twice = (await db.query(`SELECT api_key FROM clients WHERE id = $1`, [legacy.id])).rows[0].api_key
  check('Clé : migration idempotente (pas de double hash)', twice === migrated)

  // ─── Contexte d'exécution (SDK) : le fait constaté donne la cause ─────────────
  const ctxRun = await fail('/opt/jobs/deploy.sh: line 5: rake: command not found', {
    command: '/opt/jobs/deploy.sh', context: { user: 'root', home: '/root', path: '/usr/bin:/bin', shell: '/bin/sh', found: { rake: '/usr/local/rvm/gems/ruby-3.2/bin/rake' } } })
  check('Contexte : la cause cite où la commande existe vraiment', String(ctxRun.cause).includes('/usr/local/rvm/gems/ruby-3.2/bin'), ctxRun.cause)
  const badCtx = await fetch(`http://localhost:${API_PORT}/ping/${mon.ping_key}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'fail', output: 'x', context: { path: 'x'.repeat(5000) } }) })
  check('Contexte : champ trop long refusé (400)', badCtx.status === 400, String(badCtx.status))

  // ─── Résolution constatée : contexte de l'échec comparé à celui de la première réussite ───
  const { rows: [monR] } = await db.query(`INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'reindex-search',300) RETURNING id, ping_key`, [client.id])
  const ctxFail = { user: 'search', home: '/home/search', path: '/usr/bin:/bin', shell: '/bin/sh' }
  const resRun = await fail('/opt/search/reindex.sh: line 4: es-reindex: command not found', { command: '/opt/search/reindex.sh', context: ctxFail }, monR)
  await fetch(`http://localhost:${API_PORT}/ping/${monR.ping_key}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'success', exit_code: 0, command: '/opt/search/reindex.sh', context: { ...ctxFail, path: '/home/search/.local/bin:/usr/bin:/bin' } }) })
  let resolution: { changes?: Array<{ label: string; after?: string }>; text?: string } | null = null
  for (let i = 0; i < 40 && !resolution; i++) {
    await sleep(250)
    resolution = (await db.query(`SELECT resolution FROM analyses WHERE id=$1`, [resRun.id])).rows[0].resolution
  }
  check('Résolution : le PATH fourni à la réussite est constaté sur l\'analyse de l\'échec',
    resolution?.changes?.length === 1 && resolution.changes[0].label === 'PATH' && resolution.changes[0].after === '/home/search/.local/bin:/usr/bin:/bin', JSON.stringify(resolution))
  // Réussite AVANT que l'analyse de l'échec soit écrite (job relancé aussitôt) : la résolution se range quand même.
  const { rows: [monF] } = await db.query(`INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'fast-retry',300) RETURNING id, ping_key`, [client.id])
  const pingF = (body: object) => fetch(`http://localhost:${API_PORT}/ping/${monF.ping_key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await pingF({ status: 'fail', exit_code: 1, output: '/opt/x.sh: line 2: es-reindex: command not found', command: '/opt/x.sh', context: ctxFail })
  await pingF({ status: 'success', exit_code: 0, command: '/opt/x.sh', context: { ...ctxFail, path: '/opt/bin:/usr/bin:/bin' } })
  let fast: { changes?: Array<{ label: string }> } | null = null
  for (let i = 0; i < 120 && !fast; i++) {
    await sleep(250)
    fast = (await db.query(`SELECT resolution FROM analyses WHERE monitor_id=$1`, [monF.id])).rows[0]?.resolution ?? null
  }
  check('Résolution : rangée même si la réussite arrive avant l\'analyse de l\'échec', fast?.changes?.[0]?.label === 'PATH', JSON.stringify(fast))
  const shown = await (await get(`/monitors/${monR.id}/analyses`, client.api_key)).json() as Array<{ id: string; resolution?: unknown }>
  check('Résolution : renvoyée avec l\'analyse au dashboard', shown.some(r => r.id === resRun.id && r.resolution), JSON.stringify(shown).slice(0, 120))

  // ─── Lien signé d'une alerte : valider / corriger sans se connecter ─────────
  // Jeton recalculé ici avec le même format que review-links.ts (id.exp.hmac), secret lu en base.
  await db.query(`INSERT INTO app_secrets (name, value) VALUES ('review_links', $1) ON CONFLICT (name) DO NOTHING`, [crypto.randomBytes(32).toString('hex')])
  const sec = Buffer.from((await db.query(`SELECT value FROM app_secrets WHERE name='review_links'`)).rows[0].value, 'hex')
  const tok = (id: string, exp: number) => `${id}.${exp}.${crypto.createHmac('sha256', sec).update(`${id}.${exp}`).digest('base64url')}`
  const later = Math.floor(Date.now() / 1000) + 3600
  const rev = (p: string, init?: RequestInit) => fetch(`http://localhost:${API_PORT}/r/${p}`, init)
  const form = (body: string) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const target = String(d.id)
  const pageRes = await rev(tok(target, later))
  const pageHtml = await pageRes.text()
  check('Lien signé : la page montre la cause, sans rien enregistrer', pageRes.status === 200 && pageHtml.includes('Cette analyse était-elle juste')
    && (await db.query(`SELECT user_feedback FROM analyses WHERE id=$1`, [target])).rows[0].user_feedback === null, String(pageRes.status))
  check('Lien signé : jeton altéré refusé', (await rev(tok(target, later).slice(0, -2) + 'xx')).status === 404)
  check('Lien signé : jeton expiré refusé', (await rev(tok(target, Math.floor(Date.now() / 1000) - 60))).status === 404)
  check('Lien signé : ✅ enregistre la validation', (await rev(`${tok(target, later)}/ok`, form(''))).status === 200
    && (await db.query(`SELECT user_feedback FROM analyses WHERE id=$1`, [target])).rows[0].user_feedback === 'positive')
  const fixRes = await rev(`${tok(target, later)}/fix`, form('fix=' + encodeURIComponent('ajouté --single-transaction au mysqldump')))
  const savedFix = (await db.query(`SELECT verified_fix FROM analyses WHERE id=$1`, [target])).rows[0].verified_fix
  check('Lien signé : ✏️ enregistre la correction (resservie ensuite)', fixRes.status === 200 && savedFix === 'ajouté --single-transaction au mysqldump', savedFix)
  check('Lien signé : action tracée dans l\'audit', (await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE actor='lien signé'`)).rows[0].n >= 2)

  // ─── Secrets masqués au stockage (route /ping) et dans les logs déjà stockés (migration v21) ──
  await fail('backup failed: mysqldump -u root -pS3cretE2E db\nERROR password=hunter2E2E rejected', { command: 'mysqldump -u root -pS3cretE2E db' })
  const stored2 = (await db.query(`SELECT output FROM pings WHERE monitor_id=$1 ORDER BY pinged_at DESC LIMIT 1`, [mon.id])).rows[0].output as string
  check('Secrets : jamais stockés en clair (sortie du job)', !/S3cretE2E|hunter2E2E/.test(stored2) && stored2.includes('[REDACTED]'), stored2.slice(0, 80))
  const { rows: [old] } = await db.query(`INSERT INTO pings (monitor_id, status, output, pinged_at) VALUES ($1, 'fail', 'old run password=legacyS3cret', NOW() - INTERVAL '2 days') RETURNING id`, [mon.id])
  await db.query(`DELETE FROM migration_markers WHERE name = 'v21_redact_ping_output'`)
  await db.query(`DELETE FROM migration_markers WHERE name LIKE 'schema_v%'`)   // simule une base d'une version plus ancienne
  execSync('npx tsx src/db/migrations.ts', { env: { ...process.env, DATABASE_URL: dbUrl.toString() }, stdio: 'ignore' })
  const backfilled = (await db.query(`SELECT output FROM pings WHERE id=$1`, [old.id])).rows[0].output as string
  check('Secrets : la migration masque les logs déjà stockés', !backfilled.includes('legacyS3cret') && backfilled.includes('[REDACTED]'), backfilled)
  check('Secrets : rattrapage fait une seule fois (marqueur)', (await db.query(`SELECT COUNT(*)::int AS n FROM migration_markers WHERE name='v21_redact_ping_output'`)).rows[0].n === 1)

  // ─── Page de statut publique : un id invalide ne doit pas arrêter l'API ──────
  const bad = await fetch(`http://localhost:${API_PORT}/status/not-a-uuid`)
  check('Statut : id invalide → 404 sans planter l\'API', bad.status === 404 && (await fetch(`http://localhost:${API_PORT}/health`)).status === 200, String(bad.status))

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

  // ─── Boucle d'apprentissage : mémoire partagée entre jobs, pannes non reconnues ─────
  const SHARED = 'reconcile: ERROR stale advisory lock 4471 held by dead session\nexit status 1'
  const SHARED_FIX = 'pg_terminate_backend sur la session morte puis relance'
  const s1 = await fail(SHARED)
  check('Panne inconnue : signature stockée, non reconnue', !!s1.signature && s1.recognized_by === null, JSON.stringify(s1))
  const learn1 = await (await get('/clients/learning', client.api_key)).json() as { unrecognized: Array<{ signature: string }>; candidates: unknown[] }
  check('Rapport : la panne inconnue est listée', learn1.unrecognized.some(u => u.signature === s1.signature), JSON.stringify(learn1))
  await post(`/monitors/analyses/${s1.id}/fix`, client.api_key, { fix: SHARED_FIX })
  const learn2 = await (await get('/clients/learning', client.api_key)).json() as { candidates: Array<{ signature: string; verifiedFix: string }> }
  check('Correction sur panne inconnue → fiche candidate', learn2.candidates.some(c => c.signature === s1.signature && c.verifiedFix === SHARED_FIX), JSON.stringify(learn2))

  const { rows: [mon2] } = await db.query(`INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'billing-sync',300) RETURNING id, ping_key`, [client.id])
  const s2 = await fail(SHARED, {}, mon2)
  check("Autre job, même panne : correction de l'équipe resservie sans LLM", s2.llm === 0 && s2.model_used === 'memory' && s2.confidence === 'medium'
    && s2.action === `Correction vérifiée sur nightly-etl : ${SHARED_FIX}`, JSON.stringify(s2))
  const k2 = await fail(KNOWN, {}, mon2)
  check('Fiche reconnue : source enregistrée', !!k2.recognized_by && k2.recognized_by !== 'memory', JSON.stringify(k2))
  const { rows: [monOther] } = await db.query(`INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'other-sync',300) RETURNING id, ping_key`, [other.id])
  const s3 = await fail(SHARED, {}, monOther)
  check('Autre client, même panne : correction jamais partagée', s3.model_used !== 'memory', JSON.stringify(s3))
  check('Rapport : un autre client ne voit rien', (await get('/clients/learning', other.api_key)).status === 200
    && !(await (await get('/clients/learning', other.api_key)).json() as { candidates: unknown[] }).candidates.length)

  // ─── Fin de la boucle : la correction de l'équipe devient une fiche d'équipe active ─────────
  const LOCKED = 'exporter: ERROR quota table locked by maintenance window 7\nexit status 1'
  const LOCK_FIX = 'attendre la fin de la maintenance (02h30) puis relancer, ou décaler le cron à 03h'
  const l1 = await fail(LOCKED)
  await post(`/monitors/analyses/${l1.id}/fix`, client.api_key, { fix: LOCK_FIX })
  const cand = (await (await get('/clients/learning', client.api_key)).json() as { candidates: Array<{ signature: string; analysisId: string }> })
    .candidates.find(c => c.signature === l1.signature)
  check("Fiche candidate : l'analyse corrigée est donnée pour le brouillon", cand?.analysisId === l1.id, JSON.stringify(cand))
  const draft = await (await get(`/clients/fixes/draft/${l1.id}`, client.api_key)).json() as { match: string; title: string; cause: string; action: string }
  check('Brouillon : la ligne de la panne et la correction réelle', draft.match === 'exporter: ERROR quota table locked by maintenance window 7' && draft.action === LOCK_FIX, JSON.stringify(draft))
  const badFix = await post('/clients/fixes', client.api_key, { ...draft, analysisId: l1.id, match: 'texte absent des logs' })
  check('Fiche refusée si son déclencheur ne reconnaît pas la panne', badFix.status === 400, String(badFix.status))
  const foreignFix = await post('/clients/fixes', other.api_key, { ...draft, analysisId: l1.id })
  check("Un autre client ne peut pas créer de fiche sur cette panne", foreignFix.status === 404, String(foreignFix.status))
  const created = await post('/clients/fixes', client.api_key, { ...draft, analysisId: l1.id, match: 'quota table locked by maintenance' })
  const fixRow = await created.json() as { id: string }
  check("Fiche d'équipe créée", created.status === 201 && !!fixRow.id, String(created.status))
  const { rows: [mon3] } = await db.query(`INSERT INTO monitors (client_id, name, grace_period) VALUES ($1,'quota-sync',300) RETURNING id, ping_key`, [client.id])
  const l2 = await fail('importer: ERROR quota table locked by maintenance window 9\nexit status 1', {}, mon3)
  check("Autre job, même panne : servie par la fiche d'équipe, sans modèle, reconnue", l2.llm === 0 && l2.model_used === 'team-fix'
    && l2.action === LOCK_FIX && l2.recognized_by === `team-${fixRow.id}` && l2.confidence === 'high', JSON.stringify(l2))
  const after = await (await get('/clients/learning', client.api_key)).json() as { candidates: Array<{ signature: string }> }
  check('Panne devenue fiche : plus dans les candidates', !after.candidates.some(c => c.signature === l1.signature), JSON.stringify(after.candidates))
  const off = await fetch(`http://localhost:${API_PORT}/clients/fixes/${fixRow.id}`, { method: 'DELETE', headers: { 'X-API-Key': client.api_key } })
  const l3 = await fail('importer: ERROR quota table locked by maintenance window 9\nexit status 1', {}, mon3)
  check('Fiche désactivée : plus servie', off.status === 200 && l3.model_used !== 'team-fix', JSON.stringify({ status: off.status, model: l3.model_used }))

  // Job qui échoue en moins d'1 ms (ou busybox, à la seconde) : duration_ms 0 refusé faisait perdre la panne entière.
  const zero = await fail('fast: command not found', { duration_ms: 0 }, mon3)
  const { rows: [zp] } = await db.query(`SELECT p.duration_ms FROM pings p JOIN analyses a ON a.ping_id = p.id WHERE a.id = $1`, [zero.id])
  check('Durée 0 : panne reçue et analysée, durée enregistrée comme non mesurée', !!zero.id && zp?.duration_ms === null, JSON.stringify(zp))

  // Vue responsable : un incident dont la correction est écrite, un sans, un hors semaine (écart avant/après).
  type Imp = { incidents: number; week: number; documented: number }
  const imp0 = await (await get('/dashboard/impact', client.api_key)).json() as Imp
  await db.query(`INSERT INTO incidents (monitor_id, started_at, resolved_at, duration_ms, analysis_id) VALUES
    ($1, NOW() - INTERVAL '1 hour', NOW(), 60000, $2), ($3, NOW() - INTERVAL '2 hours', NOW(), 120000, NULL),
    ($3, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', 60000, NULL)`, [mon.id, l1.id, mon3.id])
  const imp = await (await get('/dashboard/impact', client.api_key)).json() as Imp
  check('Vue responsable : +3 incidents, +2 cette semaine, +1 avec correction écrite',
    imp.incidents - imp0.incidents === 3 && imp.week - imp0.week === 2 && imp.documented - imp0.documented === 1, JSON.stringify({ imp0, imp }))

  // Kit pilote : rapport calculé sur la base du client, anonymisé par défaut.
  const { pilotReport } = await import('../src/services/pilot-report')
  const rep = await pilotReport(db, { clientId: client.id, days: 30 })
  const { rows: [cnt] } = await db.query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE recognized_by IS NOT NULL)::int AS k
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id WHERE m.client_id = $1`, [client.id])
  check('Rapport pilote : chiffres de la base, aucun nom de job ni ligne d erreur',
    rep.includes(`| Diagnosed failures | ${cnt.n} |`) && rep.includes(`(${cnt.k}/${cnt.n})`) && !rep.includes('quota-sync') && !rep.includes('quota table locked'), rep.slice(0, 600))
  const repNamed = await pilotReport(db, { clientId: client.id, days: 30, names: true, signatures: true })
  check('Rapport pilote --names --signatures : noms présents et avertissement', repNamed.includes('quota-sync') && repNamed.includes('review before sharing'))

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
