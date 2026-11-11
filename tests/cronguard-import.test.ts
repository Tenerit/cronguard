import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile, execFileSync, spawnSync } from 'child_process'
import { promisify } from 'util'
import { createServer, Server } from 'http'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { lintCommand } from '../src/services/llm/command-lint'

// Import de crontab (sdk/bash/cronguard-import.sh) : la ligne réécrite doit exécuter
// EXACTEMENT la commande d'origine, sinon on casse les crons du client en les surveillant.
const SCRIPT = join(__dirname, '../sdk/bash/cronguard-import.sh')
const hasBash = spawnSync('bash', ['--version']).status === 0

const COMMANDS = [
  '/opt/scripts/backup-postgres.sh --full > /var/log/backup.log 2>&1',
  `cd /srv/app && python3 sync.py --msg 'it'"'"'s "quoted"' && echo $HOME`,
  '/usr/local/bin/certbot renew --quiet',
]
const CRONTAB = [
  'MAILTO=ops@example.com',
  '# sauvegarde',
  `0 2 * * * ${COMMANDS[0]}`,
  `*/15 * * * * ${COMMANDS[1]}`,
  `@daily ${COMMANDS[2]}`,
  '@reboot /opt/start.sh',
].join('\n')

describe.skipIf(!hasBash)('cronguard-import.sh', () => {
  let server: Server, url = '', dir = ''
  const created: Array<Record<string, string>> = []
  const linted: string[] = []

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cg-import-'))
    writeFileSync(join(dir, 'crontab'), CRONTAB)
    // cg_run factice : enregistre la commande qu'il recevrait, sans rien exécuter.
    writeFileSync(join(dir, 'lib.sh'), `cg_run() { printf '%s|%s\\n' "$1" "$4" >> "${dir.replace(/\\/g, '/')}/ran"; }\n`)
    server = createServer((req, res) => {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        if (req.headers['x-api-key'] !== 'cg_test') { res.writeHead(401).end(); return }
        if (req.url === '/monitors/lint') {   // prévention : renvoie le vrai résultat de lintCommand
          linted.push(JSON.parse(body).command)
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ findings: lintCommand(JSON.parse(body).command) }))
          return
        }
        if (req.url === '/monitors/suggest-name') {   // serveur sans modèle d'explication : le nom du code reste
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: null, role: null, critical: null, when: null }))
          return
        }
        const m = JSON.parse(body); created.push(m)
        res.writeHead(201, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ id: 'x', ping_key: `pk-${created.length}`, name: m.name }))
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => { server?.close() })

  // Asynchrone : un appel synchrone bloquerait le faux serveur HTTP de ce même process.
  const run = async (...args: string[]) => (await promisify(execFile)('bash', [SCRIPT, ...args, join(dir, 'crontab')], {
    env: { ...process.env, CRONGUARD_URL: url, CRONGUARD_API_KEY: 'cg_test', CRONGUARD_LIB: join(dir, 'lib.sh').replace(/\\/g, '/') },
    encoding: 'utf8', timeout: 20_000,
  })).stdout

  it("l'aperçu ne crée rien", async () => {
    const out = (await run())
    expect(created).toHaveLength(0)
    expect(out).toContain('<ping-key-backup-postgres>')
  })

  it('crée un monitor par job avec un nom lisible et la planification', async () => {
    (await run('--apply'))
    expect(created.map(c => c.name)).toEqual(['backup-postgres', 'sync', 'certbot'])
    expect(created.map(c => c.schedule)).toEqual(['0 2 * * *', '*/15 * * * *', '@daily'])
  })

  it("recopie variables, commentaires et @reboot, et la ligne réécrite exécute la commande d'origine", async () => {
    created.length = 0
    const lines = (await run('--apply')).trimEnd().split('\n')
    expect(lines.slice(0, 2)).toEqual(['MAILTO=ops@example.com', '# sauvegarde'])
    expect(lines[5]).toBe('@reboot /opt/start.sh')
    for (const l of lines.slice(2, 5)) {
      const cmd = l.replace(/^(@\w+|(\S+\s+){5})/, '')    // ce que cron passe à /bin/sh
      execFileSync('sh', ['-c', cmd])
    }
    const ran = readFileSync(join(dir, 'ran'), 'utf8').trimEnd().split('\n')
    expect(ran).toEqual(COMMANDS.map((c, i) => `pk-${i + 1}|${c}`))
  })

  it('prévention : signale les risques de la commande avant toute panne', async () => {
    writeFileSync(join(dir, 'crontab'), '0 1 * * * mysqldump -u root -p S3cret db > /b/db_$(date +%F).sql')
    const { stderr } = await promisify(execFile)('bash', [SCRIPT, join(dir, 'crontab')], {
      env: { ...process.env, CRONGUARD_URL: url, CRONGUARD_API_KEY: 'cg_test', CRONGUARD_LIB: join(dir, 'lib.sh').replace(/\\/g, '/') },
      encoding: 'utf8', timeout: 20_000 })
    expect(stderr).toMatch(/⚠ mysqldump : La commande contient un % non échappé/)
    expect(stderr).toMatch(/⚠ mysqldump : Le mot de passe est séparé de -p/)
    expect(stderr).not.toContain('S3cret')   // la réponse ne recopie jamais la commande
  })

  it('ne réenveloppe pas une ligne déjà surveillée', async () => {
    writeFileSync(join(dir, 'crontab'), "0 4 * * * bash -c 'source x && cg_run k echo'")
    created.length = 0
    expect((await run('--apply')).trim()).toBe("0 4 * * * bash -c 'source x && cg_run k echo'")
    expect(created).toHaveLength(0)
  })
})
