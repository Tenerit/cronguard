/**
 * Labo terrain 2 (vérité : eval/field-lab-2-truth.json ; tirage : eval/field-lab-draw.json, ordre 26 à 72).
 * Même méthode que eval/field-lab.ts ; questions jamais vues par les corrections du 12/11.
 * Défaut du 1er labo corrigé : monitors créés avec 15 min de grâce pendant l'installation, ramenés à 60 s une fois cron prêt
 * (sinon chaque job était « en retard » pendant l'installation de Debian).
 *   npx tsx eval/field-lab-2.ts      (Docker requis, ~15 min)
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

const PORT = 3097, HOOK_PORT = 3098, DB = 'cronguard_fieldlab2', NAME = 'cg-fieldlab2'
const URL_IN = `http://host.docker.internal:${PORT}`
const LAN = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.)/.test(i.address))?.address
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const adminUrl = process.env.DATABASE_URL!
const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${DB}`
const redisUrl = new URL(process.env.REDIS_URL!); redisUrl.pathname = '/10'
const LOGDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fieldlab2-'))
const GEN = path.resolve('eval/field-lab-2/gen')
const kids: ChildProcess[] = []

// Ligne enveloppée comme le fait l'import du dashboard (createImport) : même gabarit, même proposition CG_EXPECT.
function wrap(sched: string, user: string, cmd: string, key: string): string {
  const exp = ruleExpect(cmd)
  return `${sched}${user ? ' ' + user : ''} ${exp ? `CG_EXPECT='${exp.replace(/'/g, '')}' ` : ''}CRONGUARD_URL=${URL_IN} bash -c 'source /usr/local/lib/cronguard.sh && cg_run ${key} "\${SHELL:-/bin/sh}" -c "$0"' '${cmd.replace(/'/g, "'\\''")}'`
}

// Lignes des questions (eval/crontab-lines*.json ou texte de la question), planning ramené à « chaque minute ».
// file : « user-<compte> » = crontab de ce compte. g19 n'a pas de ligne : c'est un script de /etc/cron.hourly.
const CASES: Array<{ id: string; file: string; user: string; cmd: string }> = [
  { id: 'g1',      file: 'user-root',       user: '', cmd: '/root/perl/./unzip.pl > /dev/null 2>&1' },
  { id: 'g7',      file: 'user-root',       user: '', cmd: '/usr/bin/python3 /app/manage.py crontab run 4bd3d0bb6fbcdd1b5ea8 >> /var/log/cron.log 2>&1' },
  { id: 'g7hello', file: 'user-root',       user: '', cmd: 'echo "Hello world" >> /var/log/cron.log 2>&1' },
  { id: 'g10',     file: 'user-myuser',     user: '', cmd: 'rsync -av --delete myuser@mybox:/home/backup-src/ /home/backup' },
  { id: 'g10env',  file: 'user-myuser',     user: '', cmd: 'env >> /tmp/my_env_variables' },
  { id: 'g12',     file: 'user-test',       user: '', cmd: 'bash /home/test/take_backup.sh > /home/test/backup.log 2>&1 || mail -s "Backup failed, check attached logs" redacted@example.com < /home/test/backup.log' },
  { id: 'g19',     file: '',                user: '', cmd: '' },
  { id: 'g20',     file: 'user-kali',       user: '', cmd: 'bash ~/Documents/GitHub/BFOR206/hw1.sh' },
  { id: 'g29',     file: 'user-root',       user: '', cmd: 'wget -q -O /dev/null http://www.urlgoeshere.co.uk/index.php cron_event' },
  { id: 'g30a',    file: 'user-root',       user: '', cmd: '/usr/lib/postgresql/12/bin/pg_dump -h 127.0.0.1 -Fc db_kp -f /backup-nfs/dump_dbkp_TEST1`date +\\%d-\\%m-\\%y`.sql' },
  { id: 'g30b',    file: 'user-root',       user: '', cmd: '/usr/lib/postgresql/12/bin/pg_dump -h 127.0.0.1 -Fc db_kp > /backup-nfs/dump_dbkp_TEST2.sql' },
  { id: 'g40',     file: 'user-qa',         user: '', cmd: 'rsync -rav --remove-source-files --files-from=<(find /home/qa/buildbot/master/packages/rhel7 -type f -mtime +30 -exec basename {} \\;) /home/qa/buildbot/master/packages/rhel7 192.168.1.31:/local/raid0/buildbotpackages/packages/rhel7' },
  { id: 'g42',     file: 'user-root',       user: '', cmd: '/home/cvs/backup/cvs_backupScript.sh' },
  { id: 'g44',     file: 'user-root',       user: '', cmd: '/home/user/bin/checkSystem' },
  { id: 'g46',     file: 'user-swayraines', user: '', cmd: 'find /home/swayraines -mmin -300 -exec tar -zcvf folder/backup/back.tar {} > /folder/backup/backlog.log 2>&1 \\;' },
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
  await db.query(`INSERT INTO clients (email, api_key, webhook_url) VALUES ('field2@example.test', $1, $2)`, [hashApiKey(apiKey), `http://${LAN}:${HOOK_PORT}/hook`])
  const ids: Record<string, string> = {}, files: Record<string, string[]> = {}
  for (const c of CASES) {
    const m = await (await fetch(`http://localhost:${PORT}/monitors`, { method: 'POST', headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ name: c.id, schedule: '* * * * *', grace_period: 900 }) })).json() as { id: string; ping_key: string }
    ids[c.id] = m.id
    if (c.id === 'g19') {   // le script de cron.hourly s'enveloppe lui-même (comme le ferait un admin)
      fs.mkdirSync(GEN, { recursive: true })
      fs.writeFileSync(path.join(GEN, 'Hour-sound.sh'), `#!/bin/bash\n. /usr/local/lib/cronguard.sh\nCRONGUARD_URL=${URL_IN} cg_run ${m.ping_key} bash -c 'echo "The time now is $(date +%H)"'\n`)
      continue
    }
    files[c.file] ??= []
    files[c.file].push(wrap('* * * * *', c.user, c.cmd, m.ping_key))
  }
  fs.mkdirSync(GEN, { recursive: true }); for (const f of fs.readdirSync(GEN)) if (f !== 'Hour-sound.sh') fs.rmSync(path.join(GEN, f))
  for (const [f, lines] of Object.entries(files)) fs.writeFileSync(path.join(GEN, f), lines.join('\n') + '\n')
  docker('run', '-d', '--name', NAME, '--add-host', 'host.docker.internal:host-gateway', '-e', `CG_URL=${URL_IN}`, '-e', 'DATABASE_URL=postgres://app@db/app',
    '-v', `${path.resolve('eval/field-lab-2')}:/lab:ro`, 'debian:bookworm-slim', 'sh', '-c', 'sh /lab/setup.sh > /tmp/setup.log 2>&1; echo DONE >> /tmp/setup.log; sleep infinity')
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
      changed: (ctx.changed ?? []).map((x: { label: string }) => x.label), expect: ctx.expect ?? null, lastOutput: p.at(-1)?.output ?? null }))
  }
  const setupLog = docker('exec', NAME, 'sh', '-c', 'tail -c 1500 /tmp/setup.log; echo; grep -i cron /var/log/syslog 2>/dev/null | tail -5; ls -l /etc/cron.d')
  fs.mkdirSync('eval/archive', { recursive: true })
  fs.writeFileSync('eval/field-lab-2-observed.jsonl', rows.join('\n') + '\n')
  fs.writeFileSync('eval/field-lab-2-setup.log', setupLog)
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
