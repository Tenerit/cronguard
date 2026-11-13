import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile, spawnSync } from 'child_process'
import { promisify } from 'util'
import { createServer, Server } from 'http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { contextFinding } from '../src/services/llm/run-context'
import { commandFinding, lintCommand } from '../src/services/llm/command-lint'

// Leviers « contexte d'exécution » et « vérification de la commande » : les faits constatés sur la
// machine doivent donner la cause exacte, et ne JAMAIS se déclencher sans la ligne d'erreur qui va avec.

describe('contexte d\'exécution', () => {
  const base = { user: 'root', home: '/root', path: '/usr/bin:/bin', shell: '/bin/sh', lang: '', display: false, sshAgent: false }

  it('commande introuvable mais présente ailleurs : chemin exact', () => {
    const f = contextFinding('/opt/job.sh: line 5: rake: command not found', { ...base, found: { rake: '/home/u/.rvm/gems/ruby-3/bin/rake' } })
    expect(f?.id).toBe('ctx-path-missing')
    expect(f?.cause).toContain('/home/u/.rvm/gems/ruby-3/bin')
    expect(f?.action).toContain('/home/u/.rvm/gems/ruby-3/bin/rake')
  })
  it('identifiants absents + cron sous root : HOME cité', () => {
    expect(contextFinding('pg_dump: error: fe_sendauth: no password supplied', base)?.cause).toContain('/root')
  })
  it("mauvais mot de passe : rien sur l'utilisateur (il n'explique pas la panne)", () => {
    expect(contextFinding('FATAL:  password authentication failed for user "x"', base)).toBeNull()
  })
  it('locale, DISPLAY, agent SSH, sh', () => {
    expect(contextFinding("UnicodeEncodeError: 'ascii' codec can't encode", base)?.id).toBe('ctx-locale')
    expect(contextFinding("UnicodeEncodeError: 'ascii' codec can't encode", { ...base, lang: 'fr_FR.UTF-8' })).toBeNull()
    expect(contextFinding('RuntimeError: could not open display', base)?.id).toBe('ctx-no-display')
    expect(contextFinding('Permission denied (publickey).', { ...base, user: undefined })?.id).toBe('ctx-no-ssh-agent')
    expect(contextFinding('job.sh: 3: Syntax error: "(" unexpected', base)?.id).toBe('ctx-sh-not-bash')
  })
  it('sans contexte ou sans erreur liée : rien', () => {
    expect(contextFinding('rake: command not found', undefined)).toBeNull()
    expect(contextFinding('all good', base)).toBeNull()
  })
})

describe('vérification de la commande', () => {
  it.each([
    ['cp /var/log/app.$(date +%Y%m%d) /backup/', '/bin/sh: -c: line 0: unexpected EOF while looking for matching `)\'', 'cmd-percent'],
    ['mysqldump -u root -p S3cret db > /b/db.sql', "mysqldump: Got error: 1045: Access denied for user 'root'@'localhost' (using password: NO)", 'cmd-mysql-p-space'],
    ['rsync -az -e ssh -i /root/.ssh/k /data u@h:/b', 'rsync: link_stat "/data/-i" failed: No such file or directory (2)', 'cmd-rsync-e-unquoted'],
    ['sh /opt/run.sh', '/opt/run.sh: 4: source: not found', 'cmd-bashism-sh'],
    ['./backup.sh', '/bin/sh: 1: ./backup.sh: not found', 'cmd-relative-path'],
    ['sudo systemctl restart app', 'sudo: a terminal is required to read the password', 'cmd-sudo'],
  ])('%s', (cmd, logs, id) => {
    expect(commandFinding(cmd, logs)?.id).toBe(id)
  })
  it("une règle n'explique la panne que si sa ligne d'erreur est là", () => {
    expect(commandFinding('mysqldump -u root -p S3cret db', 'mysqldump: Got error: 2002: Can\'t connect')).toBeNull()
    expect(commandFinding('cp /a/$(date +%F) /b', 'cp: cannot stat: Permission denied')).toBeNull()
  })
  it('la cause ne recopie jamais la commande (mot de passe)', () => {
    const f = commandFinding('mysqldump -u root -p S3cret db', '(using password: NO)')
    expect(JSON.stringify(f)).not.toContain('S3cret')
  })
  it('prévention à l\'import : liste des risques sans échec', () => {
    expect(lintCommand('mysqldump -p S3cret db > /b/$(date +%F).sql').map(f => f.id)).toEqual(['cmd-percent', 'cmd-mysql-p-space', 'cmd-unquoted-subst'])
    expect(lintCommand('/usr/local/bin/backup.sh --full')).toEqual([])
  })
})

const hasBash = spawnSync('bash', ['--version']).status === 0 && spawnSync('python3', ['--version']).status === 0
describe.skipIf(!hasBash)('sonde du SDK bash (cg_run)', { timeout: 30_000 }, () => {
  let server: Server, url = '', dir = ''
  const pings: Array<Record<string, any>> = []
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cg-ctx-'))
    mkdirSync(join(dir, '.local', 'bin'), { recursive: true })
    writeFileSync(join(dir, '.local', 'bin', 'cgtoolxyz'), '#!/bin/sh\necho hi\n', { mode: 0o755 })
    server = createServer((req, res) => { let b = ''; req.on('data', c => { b += c }); req.on('end', () => { pings.push(JSON.parse(b)); res.end('{}') }) })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => { server?.close() })

  it("à l'échec : commande, environnement réel et emplacement de la commande introuvable", async () => {
    const sdk = join(__dirname, '../sdk/bash/cronguard.sh').replace(/\\/g, '/')
    const home = dir.replace(/\\/g, '/')
    await promisify(execFile)('bash', ['-c', `source '${sdk}' && cg_run key-1 bash -c 'cgtoolxyz --go'; true`], {
      env: { ...process.env, CRONGUARD_URL: url, HOME: home, PATH: process.env.PATH!, LANG: '', LC_ALL: '', DISPLAY: '', SSH_AUTH_SOCK: '' },
      encoding: 'utf8', timeout: 20_000,
    })
    const p = pings.at(-1)!
    expect(p.status).toBe('fail')
    expect(p.command).toBe('cgtoolxyz --go')
    expect(p.context.found.cgtoolxyz.replace(/\\/g, '/')).toMatch(/\.local\/bin\/cgtoolxyz$/)
    expect(p.context).toMatchObject({ display: false, sshAgent: false, lang: '' })
    expect(typeof p.context.user).toBe('string')
  })

  it("à l'échec : le script appelé est envoyé, secrets masqués sur la machine du job", async () => {
    const sdk = join(__dirname, '../sdk/bash/cronguard.sh').replace(/\\/g, '/')
    const sh = join(dir, 'job.sh').replace(/\\/g, '/')
    writeFileSync(sh, '#!/bin/bash\nPGPASSWORD=hunter2secret\ndocker exec -it db pg_dump app\nexit 3\n', { mode: 0o755 })
    await promisify(execFile)('bash', ['-c', `source '${sdk}' && cg_run key-3 bash -c 'bash ${sh}'; true`], {
      env: { ...process.env, CRONGUARD_URL: url }, encoding: 'utf8', timeout: 20_000,
    })
    const s = pings.at(-1)!.context.script
    expect(s.path.replace(/\\/g, '/')).toMatch(/job\.sh$/)
    expect(s.text).toContain('docker exec -it')
    expect(s.text).not.toContain('hunter2secret')
  })

  it('succès : ni commande ni contexte envoyés', async () => {
    const sdk = join(__dirname, '../sdk/bash/cronguard.sh').replace(/\\/g, '/')
    await promisify(execFile)('bash', ['-c', `source '${sdk}' && cg_run key-2 true`], { env: { ...process.env, CRONGUARD_URL: url }, encoding: 'utf8', timeout: 20_000 })
    expect(pings.at(-1)).toEqual(expect.objectContaining({ status: 'success' }))
    expect(pings.at(-1)!.context).toBeUndefined()
  })
})

import { inferRunner, diagnosticChecks } from '../src/services/llm/run-context'

describe('lanceur du job', () => {
  it.each([
    ['Last State: Terminated  Reason: OOMKilled', 'kubernetes'],
    ['Warning  BackoffLimitExceeded  job/report-1', 'kubernetes'],
    ['Nov 10 02:00:01 host systemd[1]: backup.service: Main process exited, code=exited, status=1/FAILURE', 'systemd'],
    ['Nov 10 02:00:01 host CRON[1234]: (root) CMD (/opt/backup.sh)', 'crontab'],
    ['error: something failed', undefined],
  ])('déduit des logs : %s', (logs, runner) => { expect(inferRunner(logs)).toBe(runner) })
  it('le lanceur relevé par le SDK prime sur les logs', () => {
    expect(inferRunner('CRON[1]: (root) CMD (x)', 'container-cron')).toBe('container-cron')
  })
})

describe('commandes de test du SDK → faits constatés, aucune déduction', () => {
  const base = { user: 'backup', home: '/var/backups', path: '/usr/bin:/bin', cwd: '/var/backups' }
  it('commande trouvée par votre shell de connexion, pas par le cron', () => {
    const f = contextFinding('/usr/bin/env: node: No such file or directory\nnode: not found', { ...base, loginFound: { node: '/home/me/.nvm/versions/node/v20/bin/node' } })
    expect(f?.id).toBe('ctx-login-path')
    expect(f?.cause).toContain('/home/me/.nvm/versions/node/v20/bin')
  })
  it("variable de votre shell absente sous cron et citée par l'erreur, adaptée au lanceur", () => {
    const logs = "KeyError: 'DATABASE_URL'"
    expect(contextFinding(logs, { ...base, loginOnlyVars: ['DATABASE_URL', 'EDITOR'] })?.id).toBe('ctx-env-missing')
    expect(contextFinding(logs, { ...base, runner: 'systemd', loginOnlyVars: ['DATABASE_URL'] })?.action).toContain('Environment=')
    expect(contextFinding(logs, { ...base, loginOnlyVars: ['EDITOR'] })).toBeNull()   // variable non citée : pas de conclusion
  })
  it('chemin relatif absent du dossier courant du cron', () => {
    const f = contextFinding("python: can't open file 'etl.py': [Errno 2] No such file or directory",
      { ...base, paths: [{ path: 'etl.py', relative: true, exists: false }] })
    expect(f?.id).toBe('ctx-relative-path')
    expect(f?.cause).toContain('/var/backups')
  })
  it("droits constatés : l'utilisateur du job ne peut pas écrire", () => {
    const f = contextFinding('tar: /srv/archive/x.tar: Cannot open: Permission denied',
      { ...base, paths: [{ path: '/srv/archive', relative: false, exists: true, owner: 'root', mode: '755', readable: true, writable: false }] })
    expect(f?.id).toBe('ctx-permission')
    expect(f?.cause).toMatch(/root.*755.*backup.*écrire/)
  })
  it('chemin absolu absent : le fait, sans deviner pourquoi', () => {
    expect(contextFinding('cat: /mnt/nas/export.csv: No such file or directory',
      { ...base, paths: [{ path: '/mnt/nas/export.csv', relative: false, exists: false }] })?.id).toBe('ctx-path-absent')
  })
  it("commandes de test : reproduire dans l'environnement exact du cron + écarts constatés", () => {
    const c = diagnosticChecks("php /srv/app/artisan report:send --to='ops'", { ...base, loginOnlyVars: ['APP_ENV'], loginPath: '/usr/local/bin:/usr/bin:/bin' })
    expect(c[0]).toBe(String.raw`Reproduire avec l'environnement du cron : env -i HOME=/var/backups LOGNAME=backup PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c 'php /srv/app/artisan report:send --to='\''ops'\'''`)
    expect(c.join('\n')).toContain('APP_ENV')
    expect(c.join('\n')).toContain('/usr/local/bin')
  })
})
