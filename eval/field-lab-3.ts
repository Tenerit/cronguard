/**
 * Labo terrain 3 (vérité : eval/field-lab-3-truth.json ; tirage : eval/field-lab-draw.json, ordre 80 à 98).
 * Même méthode que eval/field-lab-2.ts ; questions jamais vues par les corrections du 12 et du 13/11.
 * Première mesure indépendante de la lecture du script (SDK bash) et des fiches ajoutées le 13/11.
 * Le harnais ne juge pas : il rassemble ce que CronGuard a montré ; le jugement contre la vérité est fait ensuite.
 *   npx tsx eval/field-lab-3.ts      (Docker requis, ~15 min)
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
import { ruleExpect } from '../src/services/expect-suggest'

const PORT = 3107, HOOK_PORT = 3108, DB = 'cronguard_fieldlab3', NAME = 'cg-fieldlab3'
const URL_IN = `http://host.docker.internal:${PORT}`
const LAN = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.)/.test(i.address))?.address
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const adminUrl = process.env.DATABASE_URL!
const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${DB}`
const redisUrl = new URL(process.env.REDIS_URL!); redisUrl.pathname = '/9'
const LOGDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fieldlab3-'))
const GEN = path.resolve('eval/field-lab-3/gen')
const kids: ChildProcess[] = []

// Ligne enveloppée comme le fait l'import du dashboard (createImport) : même gabarit, même proposition CG_EXPECT.
function wrap(sched: string, user: string, cmd: string, key: string): string {
  const exp = ruleExpect(cmd)
  return `${sched}${user ? ' ' + user : ''} ${exp ? `CG_EXPECT='${exp.replace(/'/g, '')}' ` : ''}CRONGUARD_URL=${URL_IN} bash -c 'source /usr/local/lib/cronguard.sh && cg_run ${key} "\${SHELL:-/bin/sh}" -c "$0"' '${cmd.replace(/'/g, "'\\''")}'`
}

// Lignes des questions, planning ramené à « chaque minute ». file : « user-<compte> » = crontab de ce compte ;
// « etc-crontab » = ajoutée à /etc/crontab (h2 : sans champ utilisateur, comme dans la question).
const CASES: Array<{ id: string; file: string; user: string; cmd: string; pre?: string[] }> = [
  { id: 'h2',  file: 'etc-crontab', user: '', cmd: 'mysqlcheck -u root -pS3cretPass --auto-repair --check --all-databases' },
  { id: 'h4',  file: 'user-root',   user: '', cmd: '/usr/bin/curl --silent "http://localhost:8082/email-bulk?customer=Martin+Thoma&handler_pid=foo+f0a474c5-3cb1-4872-8689-c65cedb15bff&format_string=%7Breceived%3A%25y%25m%25d%7D+%7Bfoo%7D+%7Bfoo%7D+%7Bfoo%7D+%7Bfoo%7D%7Bfile_extension%7D&minutes_email=2"' },
  { id: 'h10', file: 'user-user',   user: '', cmd: '/usr/bin/python3 /home/user/bin/bash/stat_xplore.py' },
  { id: 'h14', file: 'user-me',     user: '', cmd: '/home/me/project/myscript.py', pre: ['SHELL=/bin/bash', 'PATH=/sbin:/bin:/usr/sbin:/usr/bin', 'MAILTO=""'] },
  { id: 'h18', file: 'user-pi',     user: '', cmd: 'arp -n > results.txt' },
]

function start(name: string, file: string) {
  const out = fs.openSync(path.join(LOGDIR, `${name}.log`), 'w')
  kids.push(spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', file], { stdio: ['ignore', out, out], env: {
    ...process.env, DATABASE_URL: dbUrl.toString(), REDIS_URL: redisUrl.toString(), PORT: String(PORT),
    LLM_BASE_URL: 'http://127.0.0.1:9/v1', LLM_EXPLAIN_MODEL: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
    STRIPE_SECRET_KEY: '', APP_URL: `http://localhost:${PORT}`,
  } }))
}
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const events: Array<{ event: string; job: string; at: number }> = []
const hook = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d).on('end', () => {
  try { const j = JSON.parse(b); events.push({ event: j.event, job: j.job, at: Date.now() }) } catch { /* ignoré */ } r.end('ok') }) })

async function main() {
  if (!LAN) throw new Error('adresse réseau local introuvable')
  const admin = new Pool({ connectionString: adminUrl })
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await admin.query(`CREATE DATABASE ${DB}`); await admin.end()
  const rd = new Redis(redisUrl.toString()); await rd.flushdb(); rd.disconnect()
  try { docker('rm', '-f', NAME) } catch { /* absent */ }
  await new Promise<void>(r => hook.listen(HOOK_PORT, '0.0.0.0', r))
  start('api', 'src/api/index.ts')
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).status < 500) break } catch { /* démarrage */ } await sleep(1000) }
  start('worker', 'src/workers/analysis.worker.ts'); start('checker', 'src/workers/timeout.checker.ts')
  const db = new Pool({ connectionString: dbUrl.toString() }); db.on('error', () => {})
  const apiKey = newApiKey()
  await db.query(`INSERT INTO clients (email, api_key, webhook_url) VALUES ('field3@example.test', $1, $2)`, [hashApiKey(apiKey), `http://${LAN}:${HOOK_PORT}/hook`])
  const ids: Record<string, string> = {}, files: Record<string, string[]> = {}
  for (const c of CASES) {
    const m = await (await fetch(`http://localhost:${PORT}/monitors`, { method: 'POST', headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ name: c.id, schedule: '* * * * *', grace_period: 900 }) })).json() as { id: string; ping_key: string }
    ids[c.id] = m.id
    files[c.file] ??= []
    for (const p of c.pre ?? []) files[c.file].push(p)
    files[c.file].push(wrap('* * * * *', c.user, c.cmd, m.ping_key))
  }
  fs.rmSync(GEN, { recursive: true, force: true }); fs.mkdirSync(GEN, { recursive: true })
  for (const [f, lines] of Object.entries(files)) fs.writeFileSync(path.join(GEN, f), lines.join('\n') + '\n')
  docker('run', '-d', '--name', NAME, '--add-host', 'host.docker.internal:host-gateway', '-e', `CG_URL=${URL_IN}`,
    '-v', `${path.resolve('eval/field-lab-3')}:/lab:ro`, 'debian:bookworm-slim', 'sh', '-c', 'sh /lab/setup.sh > /tmp/setup.log 2>&1; echo DONE >> /tmp/setup.log; sleep infinity')
  for (let i = 0; i < 120; i++) { try { const log = docker('exec', NAME, 'cat', '/tmp/setup.log'); if (log.includes('DONE')) { if (!log.includes('READY')) console.log('setup :\n' + log.slice(-1500)); break } } catch { /* pas prêt */ } await sleep(5000) }
  console.log('prêt', new Date().toISOString())
  await sleep(70_000)   // une première exécution de chaque job, puis la grâce normale
  for (const id of Object.values(ids)) await fetch(`http://localhost:${PORT}/monitors/${id}`, { method: 'PATCH', headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ grace_period: 60 }) })
  console.log('grâce ramenée à 60 s — observation 6 minutes')
  const t0 = Date.now()
  await sleep(6 * 60_000)

  const rows: string[] = []
  for (const c of CASES) {
    const { rows: p } = await db.query(`SELECT status, exit_code, left(output, 300) AS output FROM pings WHERE monitor_id = $1 ORDER BY pinged_at`, [ids[c.id]])
    const { rows: [m] } = await db.query(`SELECT last_status FROM monitors WHERE id = $1`, [ids[c.id]])
    const { rows: [a] } = await db.query(`SELECT a.recognized_by, a.cause, a.action, pp.context FROM analyses a LEFT JOIN pings pp ON pp.id = a.ping_id
      WHERE a.monitor_id = $1 ORDER BY a.created_at DESC LIMIT 1`, [ids[c.id]])
    const ctx = a?.context ? (typeof a.context === 'string' ? JSON.parse(a.context) : a.context) : {}
    const alerts = events.filter(e => e.job === c.id && e.event === 'alert' && e.at > t0).length
    rows.push(JSON.stringify({ id: c.id, pings: p.map(x => `${x.status}${x.exit_code != null ? ':' + x.exit_code : ''}`).join(' '), lastStatus: m.last_status, alerts,
      recognizedBy: a?.recognized_by ?? null, cause: a?.cause ?? null, action: a?.action ?? null,
      script: ctx.script ?? null, loginOnlyVars: ctx.loginOnlyVars ?? null,
      changed: (ctx.changed ?? []).map((x: { label: string }) => x.label), expect: ctx.expect ?? null, lastOutput: p.at(-1)?.output ?? null }))
  }
  const setupLog = docker('exec', NAME, 'sh', '-c', 'tail -c 1500 /tmp/setup.log; echo; tail -3 /etc/crontab; ls -la /home/me /home/me/project /home/pi; tail -3 /var/log/bulk-requests.log 2>/dev/null; true')
  fs.writeFileSync('eval/field-lab-3-observed.jsonl', rows.join('\n') + '\n')
  fs.writeFileSync('eval/field-lab-3-setup.log', setupLog)
  console.log(rows.join('\n'))
  await db.end()
}

main().catch(e => { console.error('ERREUR', e); process.exitCode = 1 }).finally(async () => {
  try { docker('rm', '-f', NAME) } catch { /* parti */ }
  for (const k of kids) { try { execSync(process.platform === 'win32' ? `taskkill /PID ${k.pid} /T /F` : `kill -9 ${k.pid}`, { stdio: 'ignore' }) } catch { /* parti */ } }
  hook.close()
  const admin = new Pool({ connectionString: adminUrl }); await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => {}); await admin.end()
  process.exit()
})
