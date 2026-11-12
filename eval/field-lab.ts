/**
 * Labo terrain (protocole : eval/FIELD-LAB-PROTOCOL.md ; tirage : eval/field-lab-draw.json ; vérité : eval/field-lab-truth.json).
 * 12 situations tirées au sort parmi de vraies questions StackExchange, reproduites dans une Debian avec son vrai cron,
 * avec les lignes de crontab des questions, enveloppées EXACTEMENT comme l'import du dashboard (CG_EXPECT proposé compris).
 * Seule adaptation : planning ramené à chaque minute. Chaîne réelle : API + worker + vérificateur, base jetable, webhook.
 * Le harnais ne juge pas : il rassemble ce que CronGuard a montré ; le jugement contre la vérité est fait ensuite, cas par cas.
 *   npx tsx eval/field-lab.ts      (Docker requis, ~15 min)
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

const PORT = 3087, HOOK_PORT = 3088, DB = 'cronguard_fieldlab', NAME = 'cg-fieldlab'
const URL_IN = `http://host.docker.internal:${PORT}`
const LAN = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.)/.test(i.address))?.address
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const adminUrl = process.env.DATABASE_URL!
const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${DB}`
const redisUrl = new URL(process.env.REDIS_URL!); redisUrl.pathname = '/11'
const LOGDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fieldlab-'))
const GEN = path.resolve('eval/field-lab/gen')
const kids: ChildProcess[] = []

// Ligne enveloppée comme le fait l'import du dashboard (createImport) : même gabarit, même proposition CG_EXPECT.
function wrap(sched: string, user: string, cmd: string, key: string): string {
  const exp = ruleExpect(cmd)
  return `${sched}${user ? ' ' + user : ''} ${exp ? `CG_EXPECT='${exp.replace(/'/g, '')}' ` : ''}CRONGUARD_URL=${URL_IN} bash -c 'source /usr/local/lib/cronguard.sh && cg_run ${key} bash -c "$0"' '${cmd.replace(/'/g, "'\\''")}'`
}

// Lignes des questions (eval/crontab-lines*.json), planning ramené à « chaque minute ».
const CASES: Array<{ id: string; file: string; user: string; cmd: string; pre?: string[] }> = [
  { id: 'f0',   file: 'cron.d-case0',     user: 'root',     cmd: 'date >> /var/log/cron-test.log 2>&1' },
  { id: 'f1',   file: 'root-crontab',     user: '',         cmd: 'mysqldump -u root -p PASS database > backup_`date "+\\%F"`.sql 2> cron_back.log' },
  { id: 'f2',   file: 'root-crontab',     user: '',         cmd: 'sudo tar -cpzf backupfolder/localhost.tar.gz /var/www' },
  { id: 'f4',   file: 'root-crontab',     user: '',         cmd: '/home2/backup/backup-all.sh' },
  { id: 'f6',   file: 'root-crontab',     user: '',         cmd: "su -s /bin/sh nobody -c 'cd ~heilee/www && git pull -q origin master' >> ~/git.log" },
  { id: 'f7',   file: 'root-crontab',     user: '',         cmd: 'php /var/www/download.php' },
  { id: 'f13',  file: 'cron.d-case13',    user: 'root',     cmd: '$binPath/zsh/test.zsh | adddate 1>>$logPath/log.csv 2>>$errorLogPath/error.txt',
    pre: ['binPath=/opt/bin', 'logPath=/var/log/case13', 'errorLogPath=/var/log/case13',
          "adddate() { while IFS= read -r line; do printf '%s %s\\n' \"$(date)\" \"$line\"; done }"] },
  { id: 'f14a', file: 'cron.d-test-cron', user: 'root',     cmd: '/root/test.sh > /dev/null', pre: ['MAILTO="logs@example.com"'] },
  { id: 'f14b', file: 'cron.d-test-cron', user: 'root',     cmd: '/root/test.sh' },
  { id: 'f16',  file: 'root-crontab',     user: '',         cmd: '/home/ubuntu/s3syncer.sh' },
  { id: 'f18a', file: 'cron.d-case18',    user: 'root',     cmd: '. /root/.bashrc; python3.7 /usr/src/collector/run.py' },
  { id: 'f18b', file: 'cron.d-case18',    user: 'root',     cmd: "echo 'hi' >> /var/log/lastlog" },
  { id: 'f20',  file: 'etc-crontab',      user: 'app_user', cmd: 'cd /var/www/apps/my_app/current/ && rake thing:do_stuff RAILS_ENV=production' },
  { id: 'f21',  file: 'etc-crontab',      user: 'root',     cmd: 'logrotate -f /etc/logrotate.d/laravel.conf' },
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
  await db.query(`INSERT INTO clients (email, api_key, webhook_url) VALUES ('field@example.test', $1, $2)`, [hashApiKey(apiKey), `http://${LAN}:${HOOK_PORT}/hook`])
  const ids: Record<string, string> = {}, files: Record<string, string[]> = {}
  for (const c of CASES) {
    const m = await (await fetch(`http://localhost:${PORT}/monitors`, { method: 'POST', headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ name: c.id, schedule: '* * * * *', grace_period: 60 }) })).json() as { id: string; ping_key: string }
    ids[c.id] = m.id
    files[c.file] ??= []
    for (const p of c.pre ?? []) files[c.file].push(p)
    files[c.file].push(wrap('* * * * *', c.user, c.cmd, m.ping_key))
  }
  fs.rmSync(GEN, { recursive: true, force: true }); fs.mkdirSync(GEN, { recursive: true })
  for (const [f, lines] of Object.entries(files)) fs.writeFileSync(path.join(GEN, f), lines.join('\n') + '\n')
  docker('run', '-d', '--name', NAME, '--add-host', 'host.docker.internal:host-gateway', '-e', `CG_URL=${URL_IN}`, '-e', 'INFLUXDB_USER=influx',
    '-v', `${path.resolve('eval/field-lab')}:/lab:ro`, 'debian:bookworm-slim', 'sh', '-c', 'sh /lab/setup.sh > /tmp/setup.log 2>&1; echo DONE >> /tmp/setup.log; sleep infinity')
  for (let i = 0; i < 120; i++) { try { const log = docker('exec', NAME, 'cat', '/tmp/setup.log'); if (log.includes('DONE')) { if (!log.includes('READY')) console.log('setup :\n' + log.slice(-1500)); break } } catch { /* pas prêt */ } await sleep(5000) }
  console.log('prêt', new Date().toISOString(), '— observation 6 minutes')
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
      changed: (ctx.changed ?? []).map((x: { label: string }) => x.label), expect: ctx.expect ?? null, lastOutput: p.at(-1)?.output ?? null }))
  }
  const setupLog = docker('exec', NAME, 'sh', '-c', 'tail -c 1500 /tmp/setup.log; echo; grep -i cron /var/log/syslog 2>/dev/null | tail -5; ls -l /etc/cron.d')
  fs.mkdirSync('eval/archive', { recursive: true })
  fs.writeFileSync('eval/field-lab-observed.jsonl', rows.join('\n') + '\n')
  fs.writeFileSync('eval/field-lab-setup.log', setupLog)
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
