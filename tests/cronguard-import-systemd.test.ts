import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile, spawnSync } from 'child_process'
import { promisify } from 'util'
import { createServer, Server } from 'http'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, delimiter } from 'path'

// Import des timers systemd (cronguard-import.sh --systemd) et remontée (cg_systemd_report),
// avec de faux systemctl / systemd-analyze / journalctl : déterministe, sans systemd.
const ROOT = join(__dirname, '..')
const hasBash = spawnSync('bash', ['--version']).status === 0

const SYSTEMCTL = `#!/usr/bin/env bash
case "$*" in
  "list-unit-files --type=timer --state=enabled --no-legend --plain")
    printf '%s\\n' 'backup.timer enabled enabled' 'weekdays.timer enabled enabled' 'quarter.timer enabled enabled' \\
      'rotate.timer enabled enabled' 'boot-only.timer enabled enabled' ;;
  "show -P Unit "*) t="\${4%.timer}"; echo "$t.service" ;;
  "show -P TimersCalendar backup.timer")   echo '{ OnCalendar=*-*-* 03:30:00 ; next_elapse=Mon 2026-11-09 03:30:00 UTC }' ;;
  "show -P TimersCalendar weekdays.timer") echo '{ OnCalendar=Mon..Fri *-*-* 07:05:00 ; next_elapse=Mon 2026-11-09 07:05:00 UTC }' ;;
  "show -P TimersCalendar quarter.timer")  echo '{ OnCalendar=*-*-* *:00/15:00 ; next_elapse=Sun 2026-11-08 10:15:00 UTC }' ;;
  "show -P TimersMonotonic rotate.timer")  echo '{ OnUnitActiveUSec=1h 30min ; next_elapse=n/a }' ;;
  "show -P TimersMonotonic boot-only.timer") echo '{ OnBootUSec=5min ; next_elapse=n/a }' ;;
  "show -P ExecMainStartTimestampMonotonic job.service") echo 1000000 ;;
  "show -P ExecMainExitTimestampMonotonic job.service")  echo 3500000 ;;
  *) exit 1 ;;
esac
`
const ANALYZE = `#!/usr/bin/env bash
[[ "$*" == "calendar --iterations=2 *:00/15:00" || "$*" == *"00/15"* ]] || exit 1
echo '  Original form: *:00/15:00'
echo '    Next elapse: Sun 2026-11-08 10:15:00 UTC'
echo '       Iter. #2: Sun 2026-11-08 10:30:00 UTC'
`
const JOURNAL = `#!/usr/bin/env bash
[[ "$*" == *"_SYSTEMD_INVOCATION_ID=inv-42"* ]] || exit 0
echo 'pg_dump: starting'
echo 'Killed'
`

describe.skipIf(!hasBash)('timers systemd', () => {
  let server: Server, url = '', dir = ''
  const created: Array<Record<string, unknown>> = []
  const pings: Array<{ key: string; body: Record<string, unknown> }> = []

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cg-systemd-'))
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, 'bin', 'systemctl'), SYSTEMCTL, { mode: 0o755 })
    writeFileSync(join(dir, 'bin', 'systemd-analyze'), ANALYZE, { mode: 0o755 })
    writeFileSync(join(dir, 'bin', 'journalctl'), JOURNAL, { mode: 0o755 })
    server = createServer((req, res) => {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        if (req.url?.startsWith('/ping/')) { pings.push({ key: req.url.slice(6), body: JSON.parse(body) }); res.end('{}'); return }
        const m = JSON.parse(body); created.push(m)
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ping_key: `pk-${created.length}` }).replace('":"', '": "'))
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => { server?.close() })

  const env = (extra: Record<string, string> = {}) => ({
    ...process.env, ...extra, PATH: join(dir, 'bin') + delimiter + process.env.PATH,
    CRONGUARD_URL: url, CRONGUARD_API_KEY: 'cg_test', CRONGUARD_LIB: '/usr/local/lib/cronguard.sh',
  })
  const bash = async (args: string[], extra?: Record<string, string>) =>
    (await promisify(execFile)('bash', args, { env: env(extra), encoding: 'utf8', timeout: 20_000 }))

  it('traduit les plannings et crée un monitor par timer lisible', async () => {
    const { stdout, stderr } = await bash([join(ROOT, 'sdk/bash/cronguard-import.sh'), '--systemd', '--apply'])
    expect(created).toEqual([
      { name: 'backup',   schedule: '30 3 * * *',   env: 'production' },
      { name: 'weekdays', schedule: '5 7 * * 1-5',  env: 'production' },
      { name: 'quarter',  grace_period: 1350,       env: 'production' },   // 15 min × 1,5
      { name: 'rotate',   grace_period: 8100,       env: 'production' },   // 1 h 30 × 1,5
    ])
    expect(stderr).toContain('boot-only.timer : planning non lu')
    // Drop-in : la commande du service n'est pas touchée, le rapport passe en ExecStopPost.
    expect(stdout).toContain("cat > '/etc/systemd/system/backup.service.d/cronguard.conf'")
    expect(stdout).toContain("ExecStopPost=/bin/bash -c 'source /usr/local/lib/cronguard.sh && cg_systemd_report pk-1 %n'")
    expect(stdout).not.toMatch(/ExecStart=/)
    expect(stdout.trimEnd().endsWith('systemctl daemon-reload')).toBe(true)
  })

  it('aperçu sans --apply : rien de créé', async () => {
    created.length = 0
    const { stdout } = await bash([join(ROOT, 'sdk/bash/cronguard-import.sh'), '--systemd', 'backup.timer'])
    expect(created).toHaveLength(0)
    expect(stdout).toContain('cg_systemd_report <ping-key-backup> %n')
  })

  const report = (vars: Record<string, string>) =>
    bash(['-c', `source '${join(ROOT, 'sdk/bash/cronguard.sh').replace(/\\/g, '/')}' && cg_systemd_report key-1 job.service`], vars)

  it('succès : ping success avec la durée mesurée par systemd', async () => {
    pings.length = 0
    await report({ SERVICE_RESULT: 'success', EXIT_STATUS: '0', INVOCATION_ID: 'inv-42' })
    expect(pings).toEqual([{ key: 'key-1', body: { status: 'success', exit_code: 0, duration_ms: 2500 } }])
  })

  it("échec tué par signal : code numérique, logs de CETTE exécution + résultat systemd", async () => {
    pings.length = 0
    await report({ SERVICE_RESULT: 'oom-kill', EXIT_STATUS: 'KILL', INVOCATION_ID: 'inv-42' })
    expect(pings[0].body).toMatchObject({ status: 'fail', exit_code: 1, duration_ms: 2500 })
    expect(pings[0].body.output).toBe('pg_dump: starting\nKilled\nsystemd: unit=job.service result=oom-kill exit_status=KILL\n')
  })
})
