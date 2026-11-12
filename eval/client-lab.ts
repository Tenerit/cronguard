/**
 * Labo « une journée chez trois clients » (2026-11-12) — toute la chaîne réelle : vrai crond (Alpine), SDK installé
 * DEPUIS le serveur (/sdk/cronguard.sh, comme l'étape 3 du README), crontab au format de l'import, vraie API + worker +
 * vérificateur de retards sur une base jetable, alertes livrées par webhook, tableau de bord, rapport de pilote.
 * Pas de modèle (comportement par défaut).
 *
 * Clients (eval/client-lab/*.sh) : boutique en ligne (sauvegarde pg_dump, sync des factures, sitemap), équipe data
 * (ETL, export de rapport, archivage rsync), ops (certificats, nettoyage, heartbeat témoin).
 * Biais déclaré : scénarios écrits par moi, mêmes mécanismes que les labos SDK. Ce labo valide la CHAÎNE de bout en bout,
 * pas la capacité à reconnaître des pannes inconnues.
 *
 * Attentes fixées AVANT le premier lancement :
 *   1. phase saine (≥ 3 exécutions par job) : 0 ping en échec, 0 alerte ;
 *   2. 8 pannes injectées : chacune donne une alerte livrée par webhook, et la cause établie par le constat attendu
 *      (EXPECT) pour ≥ 7 sur 8 ; pour renew-certs (bogue applicatif) : aucun constat affirmé, « script modifié » montré ;
 *   3. le heartbeat (témoin) ne tombe jamais en échec pendant les pannes ;
 *   4. après réparation : chaque job repasse « ok », un avis de rétablissement est livré, le tableau de bord compte 0 échec ;
 *   5. machine ops arrêtée : alerte « en retard » pour le heartbeat en moins de 5 minutes ;
 *   6. rapport de pilote : nombre de pannes diagnostiquées = nombre d'analyses en base.
 *   npx tsx eval/client-lab.ts      (Docker requis, ~15 min)
 */
import 'dotenv/config'
import { spawn, execFileSync, execSync, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import * as os from 'os'
import * as path from 'path'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { newApiKey, hashApiKey } from '../src/services/api-keys'
import { pilotReport } from '../src/services/pilot-report'

const PORT = 3077, HOOK_PORT = 3078, DB = 'cronguard_clientlab'
const LAN = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.)/.test(i.address))?.address
if (!LAN) throw new Error('adresse réseau local introuvable (le webhook ne peut pas viser 127.0.0.1)')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const adminUrl = process.env.DATABASE_URL!
const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${DB}`
const redisUrl = new URL(process.env.REDIS_URL!); redisUrl.pathname = '/12'
const LOGDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-clientlab-'))
const kids: ChildProcess[] = []
const CONTAINERS = ['cg-clientlab-shop', 'cg-clientlab-data', 'cg-clientlab-ops']

const JOBS = {
  shop: { backup: 'backup-db', invoices: 'sync-invoices', sitemap: 'sitemap' },
  data: { etl: 'etl-nightly', export: 'export-report', archive: 'archive-data' },
  ops:  { certs: 'renew-certs', cleanup: 'cleanup-tmp', heartbeat: 'heartbeat' },
} as const
const EXPECT: Record<string, string | null> = {
  'backup-db': 'ctx-disk-full', 'sync-invoices': 'ctx-net-refused', sitemap: 'ctx-login-path',
  'etl-nightly': 'ctx-env-missing', 'export-report': 'ctx-expect', 'archive-data': 'ctx-permission',
  'cleanup-tmp': 'ctx-oom', 'renew-certs': null,
}
const INJECT: Record<string, [string, string]> = {   // conteneur, commande (root)
  'backup-db':     ['shop', 'dd if=/dev/zero of=/backups/filler bs=1024 count=4096 2>/dev/null; true'],
  'sync-invoices': ['shop', 'pkill -f billing.py; true'],
  sitemap:         ['shop', `cp /opt/jobs/sitemap.sh /opt/sitemap.bak && printf '#!/bin/sh\\nsitemapgen > /srv/www/sitemap.xml\\n' > /opt/jobs/sitemap.sh`],
  'etl-nightly':   ['data', `cp /etc/crontabs/app /opt/crontab.bak && sed -i 's#WAREHOUSE_URL=postgres://etl@warehouse.internal/dw ##' /etc/crontabs/app`],
  'export-report': ['data', `printf 'id,amount\\n' > /srv/data/upstream.csv`],
  'archive-data':  ['data', 'chown root:root /archive && chmod 755 /archive'],
  'renew-certs':   ['ops',  `cp /opt/jobs/renew-certs.sh /opt/certs.bak && printf '#!/bin/sh\\necho "certbot: error: unrecognized arguments: --dry-run-only" >&2\\nexit 2\\n' > /opt/jobs/renew-certs.sh`],
  'cleanup-tmp':   ['ops',  'touch /etc/ops/full-index'],
}
const REPAIR: Record<string, [string, string]> = {
  'backup-db':     ['shop', 'rm -f /backups/filler'],
  'sync-invoices': ['shop', 'nohup python3 /opt/billing.py >/dev/null 2>&1 &'],
  sitemap:         ['shop', 'cp /opt/sitemap.bak /opt/jobs/sitemap.sh'],
  'etl-nightly':   ['data', 'cp /opt/crontab.bak /etc/crontabs/app'],
  'export-report': ['data', `printf 'id,amount\\n1,10\\n2,20\\n3,30\\n' > /srv/data/upstream.csv`],
  'archive-data':  ['data', 'chown app /archive'],
  'renew-certs':   ['ops',  'cp /opt/certs.bak /opt/jobs/renew-certs.sh'],
  'cleanup-tmp':   ['ops',  'rm -f /etc/ops/full-index'],
}

function start(name: string, file: string) {
  const out = fs.openSync(path.join(LOGDIR, `${name}.log`), 'w')
  kids.push(spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', file], { stdio: ['ignore', out, out], env: {
    ...process.env, DATABASE_URL: dbUrl.toString(), REDIS_URL: redisUrl.toString(), PORT: String(PORT),
    LLM_BASE_URL: 'http://127.0.0.1:9/v1', LLM_EXPLAIN_MODEL: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
    STRIPE_SECRET_KEY: '', APP_URL: `http://localhost:${PORT}`,
  } }))
}
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const sh = (c: string, cmd: string) => { try { docker('exec', `cg-clientlab-${c}`, 'sh', '-c', cmd) } catch (e) { console.log(`  ! ${c}: ${(e as Error).message.split('\n')[0]}`) } }

const events: Array<{ event: string; job: string; cause?: string; at: number }> = []
const hook = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
  try { const j = JSON.parse(b); events.push({ event: j.event, job: j.job, cause: j.cause, at: Date.now() }) } catch { /* ignoré */ }
  r.end('ok') }) })

async function waitFor<T>(label: string, maxMs: number, fn: () => Promise<T | null | undefined | false>): Promise<T | null> {
  const end = Date.now() + maxMs
  while (Date.now() < end) { const v = await fn(); if (v) return v as T; await sleep(5000) }
  console.log(`  … délai dépassé : ${label}`); return null
}

async function main() {
  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await admin.query(`CREATE DATABASE ${DB}`); await admin.end()
  const rd = new Redis(redisUrl.toString()); await rd.flushdb(); rd.disconnect()
  for (const c of CONTAINERS) { try { docker('rm', '-f', c) } catch { /* absent */ } }
  await new Promise<void>(r => hook.listen(HOOK_PORT, '0.0.0.0', r))

  start('api', 'src/api/index.ts')
  await waitFor('API', 90_000, async () => { try { return (await fetch(`http://localhost:${PORT}/health`)).status < 500 } catch { return false } })
  start('worker', 'src/workers/analysis.worker.ts'); start('checker', 'src/workers/timeout.checker.ts')
  const db = new Pool({ connectionString: dbUrl.toString() }); db.on('error', () => {})
  const apiKey = newApiKey()
  const { rows: [client] } = await db.query(`INSERT INTO clients (email, api_key, webhook_url) VALUES ('lab@example.test', $1, $2) RETURNING id`,
    [hashApiKey(apiKey), `http://${LAN}:${HOOK_PORT}/hook`])
  const keys: Record<string, string> = {}, ids: Record<string, string> = {}
  for (const group of Object.values(JOBS)) for (const name of Object.values(group)) {
    const r = await fetch(`http://localhost:${PORT}/monitors`, { method: 'POST', headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ name, schedule: '* * * * *', grace_period: 60 }) })
    const m = await r.json() as { id: string; ping_key: string }
    keys[name] = m.ping_key; ids[name] = m.id
  }
  const env = (pairs: Record<string, string>) => Object.entries({ CG_URL: `http://host.docker.internal:${PORT}`, ...pairs }).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  const lab = path.resolve('eval/client-lab')
  const base = ['run', '-d', '--add-host', 'host.docker.internal:host-gateway', '-v', `${lab}:/lab:ro`]
  docker(...base, '--name', 'cg-clientlab-shop', '--tmpfs', '/backups:size=2m,uid=1000', ...env({ KEY_BACKUP: keys['backup-db'], KEY_INVOICES: keys['sync-invoices'], KEY_SITEMAP: keys.sitemap }),
    'alpine:3.20', 'sh', '-c', 'sh /lab/shop.sh && sleep infinity')
  docker(...base, '--name', 'cg-clientlab-data', ...env({ KEY_ETL: keys['etl-nightly'], KEY_EXPORT: keys['export-report'], KEY_ARCHIVE: keys['archive-data'] }),
    'alpine:3.20', 'sh', '-c', 'sh /lab/data.sh && sleep infinity')
  docker(...base, '--name', 'cg-clientlab-ops', '--memory=200m', '--memory-swap=200m', ...env({ KEY_CERTS: keys['renew-certs'], KEY_CLEANUP: keys['cleanup-tmp'], KEY_HEARTBEAT: keys.heartbeat }),
    'alpine:3.20', 'sh', '-c', 'sh /lab/ops.sh && sleep infinity')
  for (const c of CONTAINERS) await waitFor(`${c} prêt`, 240_000, async () => docker('logs', c).includes('READY'))
  console.log('clients prêts', new Date().toISOString())

  const pings = async (name: string, since: Date) => (await db.query(`SELECT status, count(*)::int AS n FROM pings WHERE monitor_id = $1 AND pinged_at > $2 GROUP BY status`, [ids[name], since])).rows as Array<{ status: string; n: number }>
  const all = Object.keys(ids)

  // ── 1. Phase saine ──
  const t0 = new Date()
  await waitFor('3 exécutions par job', 300_000, async () => {
    for (const n of all) if (((await pings(n, t0)).find(p => p.status === 'success')?.n ?? 0) < 3) return false
    return true
  })
  const healthyFails = (await db.query(`SELECT m.name, count(*)::int AS n FROM pings p JOIN monitors m ON m.id = p.monitor_id WHERE p.status = 'fail' GROUP BY m.name`)).rows
  const healthyRuns = (await db.query(`SELECT count(*)::int AS n FROM pings`)).rows[0].n
  const healthyAlerts = events.length
  console.log('phase saine :', healthyRuns, 'exécutions,', healthyFails.length, 'jobs en échec,', healthyAlerts, 'alertes')

  // ── 2. Pannes ──
  const tFail = new Date()
  for (const [job, [c, cmd]] of Object.entries(INJECT)) sh(c, cmd)
  const failures: Record<string, { recognized: string | null; cause: string; changed: string[]; alert: boolean; exit: number | null }> = {}
  for (const job of Object.keys(INJECT)) {
    const a = await waitFor(`analyse ${job}`, 240_000, async () => (await db.query(
      `SELECT a.recognized_by, a.cause, p.context, p.exit_code FROM analyses a JOIN pings p ON p.id = a.ping_id
       WHERE a.monitor_id = $1 AND a.created_at > $2 ORDER BY a.created_at LIMIT 1`, [ids[job], tFail])).rows[0])
    const ctx = a?.context ? (typeof a.context === 'string' ? JSON.parse(a.context) : a.context) : {}
    failures[job] = { recognized: a?.recognized_by ?? null, cause: a?.cause ?? '(aucune analyse)', exit: a?.exit_code ?? null,
      changed: (ctx.changed ?? []).map((c: { label: string }) => c.label), alert: false }
  }
  await sleep(10_000)
  for (const job of Object.keys(INJECT)) failures[job].alert = events.some(e => e.event === 'alert' && e.job === job && e.at > tFail.getTime())
  const heartbeatFailed = (await pings('heartbeat', tFail)).some(p => p.status === 'fail')

  // ── 4. Réparation ──
  const tRepair = new Date()
  for (const [, [c, cmd]] of Object.entries(REPAIR)) sh(c, cmd)
  const repaired: Record<string, { ok: boolean; recovery: boolean }> = {}
  for (const job of Object.keys(REPAIR)) {
    const ok = !!(await waitFor(`retour ok ${job}`, 240_000, async () => (await db.query(`SELECT last_status FROM monitors WHERE id = $1`, [ids[job]])).rows[0].last_status === 'ok'))
    repaired[job] = { ok, recovery: false }
  }
  await sleep(10_000)
  for (const job of Object.keys(REPAIR)) repaired[job].recovery = events.some(e => e.event === 'recovery' && e.job === job && e.at > tRepair.getTime())
  const ov = await (await fetch(`http://localhost:${PORT}/dashboard/overview`, { headers: { 'X-API-Key': apiKey } })).json() as { monitors: Record<string, number> }

  // ── 5. Machine ops arrêtée ──
  const tDown = Date.now()
  docker('stop', 'cg-clientlab-ops')
  const late = await waitFor('heartbeat en retard', 300_000, async () => (await db.query(`SELECT last_status FROM monitors WHERE id = $1`, [ids.heartbeat])).rows[0].last_status === 'late')
  await sleep(10_000)
  const lateAlert = events.find(e => e.event === 'alert' && e.job === 'heartbeat' && e.at > tDown)
  const lateMin = lateAlert ? ((lateAlert.at - tDown) / 60000).toFixed(1) : null

  // ── 6. Rapport de pilote ──
  const report = await pilotReport(db, { clientId: client.id, days: 1, names: true })
  const nAnalyses = (await db.query(`SELECT count(*)::int AS n FROM analyses`)).rows[0].n

  // ── Bilan ──
  const hit = Object.entries(failures).filter(([j, f]) => EXPECT[j] ? f.recognized === EXPECT[j] : !String(f.recognized ?? '').startsWith('ctx-') && f.changed.some(c => c.includes('renew-certs.sh modifié')))
  const lines = [
    `# Labo « une journée chez trois clients » — ${new Date().toISOString().slice(0, 16)}`, '',
    `1. Phase saine : ${healthyRuns} exécutions, ${healthyFails.length} job(s) en échec, ${healthyAlerts} alerte(s). Attendu 0 / 0 → ${healthyFails.length === 0 && healthyAlerts === 0 ? 'OK' : 'ÉCHEC'}`,
    `2. Pannes : cause attendue ${hit.length}/8 (seuil 7) → ${hit.length >= 7 ? 'OK' : 'ÉCHEC'} ; alertes livrées ${Object.values(failures).filter(f => f.alert).length}/8`, '',
    '| Job | Attendu | Établi par | Alerte | Cause affichée | Changé |', '|---|---|---|---|---|---|',
    ...Object.entries(failures).map(([j, f]) => `| ${j} | ${EXPECT[j] ?? '(rien d\'affirmé)'} | ${f.recognized ?? '—'} | ${f.alert ? 'oui' : 'non'} | ${f.cause.replace(/\|/g, '/').slice(0, 110)} | ${f.changed.join(' ; ').slice(0, 90)} |`), '',
    `3. Heartbeat témoin en échec pendant les pannes : ${heartbeatFailed ? 'OUI → ÉCHEC' : 'non → OK'}`,
    `4. Réparation : ${Object.values(repaired).filter(r => r.ok).length}/8 de retour « ok », ${Object.values(repaired).filter(r => r.recovery).length}/8 avis de rétablissement ; tableau de bord : ${JSON.stringify(ov.monitors)}`,
    ...Object.entries(repaired).filter(([, r]) => !r.ok || !r.recovery).map(([j, r]) => `   - ${j} : ok=${r.ok} rétablissement=${r.recovery}`),
    `5. Machine ops arrêtée : heartbeat « en retard » ${late ? 'oui' : 'NON'}, alerte livrée ${lateMin ? `après ${lateMin} min` : 'NON'} (seuil 5 min)`,
    `6. Rapport de pilote : ${report.includes(`| Diagnosed failures | ${nAnalyses} |`) ? 'OK' : 'ÉCHEC'} (${nAnalyses} analyses en base)`, '',
    '## Rapport de pilote produit', '', report,
  ]
  fs.mkdirSync('eval/archive', { recursive: true })
  fs.writeFileSync('eval/archive/CLIENT-LAB.md', lines.join('\n'))
  console.log(lines.slice(0, 20).join('\n'))
  await db.end()
}

main().catch(e => { console.error('ERREUR', e); process.exitCode = 1 }).finally(async () => {
  for (const c of CONTAINERS) { try { docker('rm', '-f', c) } catch { /* déjà parti */ } }
  for (const k of kids) { try { execSync(process.platform === 'win32' ? `taskkill /PID ${k.pid} /T /F` : `kill -9 ${k.pid}`, { stdio: 'ignore' }) } catch { /* parti */ } }
  hook.close()
  console.log('journaux :', LOGDIR)
  const admin = new Pool({ connectionString: adminUrl }); await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => {}); await admin.end()
  process.exit()
})
