/**
 * CronGuard SDK — Node.js / TypeScript
 *
 * npm install axios  (seule dépendance)
 *
 * Usage :
 *   import { CronGuard } from './cronguard'
 *   const cg = new CronGuard('http://localhost:3000')
 *
 *   // Wrapper automatique
 *   await cg.monitor('ma-ping-key', async () => {
 *     const count = await syncDatabase()
 *     return { records: count }
 *   })
 *
 *   // Manuel
 *   await cg.success('ma-ping-key', { records: 1500, durationMs: 4200 })
 *   await cg.fail('ma-ping-key', { exitCode: 1, output: err.stack })
 */

import axios from 'axios'

interface PingOptions {
  records?:    number
  durationMs?: number
  exitCode?:   number
  output?:     string
}

interface MonitorResult {
  records?: number
  [key: string]: unknown
}

// Environnement réel du job à l'échec (noms, chemins, booléens ; aucune valeur secrète) : permet au
// serveur d'établir les pannes « marche à la main, pas en cron » (locale, HOME, agent SSH…).
// Qui a lancé le job (même règle que sdk/python _runner) : la cause d'une panne en dépend.
function runner(): string {
  const e = process.env, fs = require('fs')
  if (e.KUBERNETES_SERVICE_HOST) return 'kubernetes'
  if (e.INVOCATION_ID) return 'systemd'          // posé par systemd pour chaque unité
  let cron = false
  try {                                          // Linux : un ancêtre s'appelle cron / crond / anacron ?
    let pid = process.ppid
    for (let i = 0; i < 8 && pid > 1; i++) {
      if (['cron', 'crond', 'anacron'].includes(fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim())) { cron = true; break }
      pid = Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').pop()!.trim().split(' ')[1])
    }
  } catch { /* pas de /proc (macOS, Windows) */ }
  if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) return cron ? 'container-cron' : 'container'
  if (cron) return 'crontab'
  if (e.XPC_SERVICE_NAME && e.XPC_SERVICE_NAME !== '0') return 'launchd'
  return ''
}

// Commandes de test (mêmes règles que le bloc cg-probes des SDK bash et Python), à l'échec, lecture seule, 3 s max :
//  1. votre shell de connexion (où le job « marche à la main ») : son PATH, où il trouve les commandes introuvables
//     sous cron, et les NOMS des variables qu'il a et que le job n'a pas (jamais les valeurs) ;
//  2. les chemins cités par l'erreur : existence, relatif ou non, propriétaire, droits, dossier parent.
// CG_PROBE_LOGIN=0 désactive la sonde 1.
const NOISE = new Set(['_', 'SHLVL', 'PWD', 'OLDPWD', 'PS1', 'PS2', 'PS4', 'TERM', 'COLUMNS', 'LINES', 'MAIL', 'PROMPT_COMMAND'])
export function loginProbe(names: string[]): Record<string, unknown> {
  if (process.env.CG_PROBE_LOGIN === '0' || process.platform === 'win32') return {}
  const os = require('os'), { spawnSync } = require('child_process')
  let sh = '/bin/sh'
  try { sh = os.userInfo().shell || sh } catch { /* pas d'entrée passwd */ }
  let script = 'printf "__CG_PATH=%s\\n" "$PATH"; '
  for (const n of names) if (/^[\w.+-]+$/.test(n)) script += `printf "__CG_W_%s=%s\\n" "${n}" "$(command -v -- '${n}' 2>/dev/null)"; `
  script += 'env'
  const r = spawnSync(sh, ['-lic', script], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], cwd: os.homedir(), encoding: 'utf8' })
  if (!r.stdout) return {}
  const res: Record<string, unknown> = {}, seen = new Set<string>(), where: Record<string, string> = {}
  for (const line of String(r.stdout).split('\n')) {
    if (line.startsWith('__CG_PATH=')) res.loginPath = line.slice(10, 1034)
    else if (line.startsWith('__CG_W_')) { const [k, v = ''] = line.slice(7).split(/=(.*)/s); if (v.startsWith('/')) where[k] = v.slice(0, 256) }
    else { const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line); if (m) seen.add(m[1]) }
  }
  const only = [...seen].filter(n => !(n in process.env) && !NOISE.has(n) && !/^(BASH_|HIST|LESS|LS_|__CG)/.test(n)).sort()
  if (only.length) res.loginOnlyVars = only.slice(0, 40)
  if (Object.keys(where).length) res.loginFound = where
  return res
}

export function pathProbe(text: string): Array<Record<string, unknown>> {
  const fs = require('fs'), os = require('os'), p = require('path')
  const cands: string[] = [], denied = new Set<string>()
  for (const line of text.split('\n')) {
    if (!/No such file|Permission denied|cannot open|can't open|cannot access|cannot stat|Read-only file system/i.test(line)) continue
    // Chemin non cité : jeton entier depuis un début de mot (« data/input.csv », pas « /input.csv »).
    for (const m of line.matchAll(/'([^'\s]{1,200})'|"([^"\s]{1,200})"|(?:^|[\s(=])((?:~|\.{1,2})?\/?[\w.@+-]+(?:\/[\w.@+-]+)+)/g)) {
      const v = m[1] ?? m[2] ?? m[3]
      if ((v.includes('/') || v.includes('.')) && !cands.includes(v)) cands.push(v)
      if ((v.includes('/') || v.includes('.')) && /Permission denied|Read-only file system/i.test(line)) denied.add(v)
    }
  }
  const expand = (v: string) => v.startsWith('~') ? p.join(os.homedir(), v.slice(1)) : v
  const todo: string[] = []
  for (const v of cands) {
    todo.push(v)
    const parent = p.dirname(expand(v))
    if ((denied.has(v) || !fs.existsSync(expand(v))) && parent && parent !== '.' && fs.existsSync(parent) && !todo.includes(parent)) todo.push(parent)   // fichier à créer : le dossier parent porte les droits
  }
  return todo.slice(0, 5).map(v => {
    const q = expand(v), d: Record<string, unknown> = { path: v.slice(0, 256), relative: !p.isAbsolute(q), exists: fs.existsSync(q) }
    if (d.exists) {
      const s = fs.statSync(q)
      // Nom du propriétaire lu dans /etc/passwd (pas de sous-processus : `id` écrivait sur la sortie d'erreur du job).
      d.owner = String(s.uid)
      try {
        const row = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find((l: string) => l.split(':')[2] === String(s.uid))
        if (row) d.owner = row.split(':')[0]
      } catch { /* pas de /etc/passwd (Windows) */ }
      d.mode = (s.mode & 0o777).toString(8)
      try { fs.accessSync(q, fs.constants.R_OK); d.readable = true } catch { d.readable = false }
      try { fs.accessSync(q, fs.constants.W_OK); d.writable = true } catch { d.writable = false }
    }
    return d
  })
}

function runContext(output = '') {
  const e = process.env
  let user = ''
  try { user = require('os').userInfo().username } catch { /* conteneur sans entrée passwd */ }
  const r = runner()
  const out = output.slice(-20000)
  const names = [...new Set([...out.matchAll(/(?:^|\s)([\w.+-]+): (?:command )?not found/gm)].map(m => m[1]))].slice(0, 5)
  const paths = pathProbe(out)
  return {
    user, home: e.HOME ?? '', path: (e.PATH ?? '').slice(0, 1024), shell: e.SHELL ?? '',
    lang: e.LC_ALL || e.LANG || '', cwd: process.cwd().slice(0, 256),
    display: !!e.DISPLAY, sshAgent: !!e.SSH_AUTH_SOCK, ...(r ? { runner: r } : {}),
    ...loginProbe(names), ...(paths.length ? { paths } : {}),
  }
}

export class CronGuard {
  constructor(private readonly baseUrl: string) {}

  async success(pingKey: string, opts: PingOptions = {}) {
    return this.ping(pingKey, { status: 'success', ...opts })
  }

  async fail(pingKey: string, opts: PingOptions = {}) {
    return this.ping(pingKey, { status: 'fail', ...opts, context: runContext(opts.output) })
  }

  // ── Wrapper "fire and forget" ─────────────────────────────────────────────
  // Exécute fn(), mesure la durée, capte les erreurs, envoie le ping.
  // Ne lève jamais d'erreur liée au monitoring pour ne pas casser le job.

  async monitor<T extends MonitorResult>(
    pingKey: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    let result: T

    try {
      result = await fn()
      await this.success(pingKey, {
        durationMs: Date.now() - start,
        records:    result?.records,
      }).catch(() => {}) // Ne pas crasher si le ping échoue
      return result
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      await this.fail(pingKey, {
        durationMs: Date.now() - start,
        exitCode:   1,
        // Capture stack + message (tronqué à 3000 chars)
        output: `${error.message}\n${error.stack ?? ''}`.slice(0, 3000),
      }).catch(() => {})
      throw err // Re-throw pour ne pas masquer l'erreur
    }
  }

  private async ping(pingKey: string, body: Record<string, unknown>) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/ping/${pingKey}`,
        body,
        { timeout: 5000, headers: { 'Content-Type': 'application/json' } }
      )
      return res.data
    } catch {
      // Silencieux — le monitoring ne doit jamais bloquer le job
    }
  }
}

// ── Export fonctionnel (sans instanciation) ───────────────────────────────────

const DEFAULT_URL = process.env.CRONGUARD_URL ?? 'http://localhost:3000'
const cg = new CronGuard(DEFAULT_URL)

export const monitor   = cg.monitor.bind(cg)
export const pingOk    = cg.success.bind(cg)
export const pingFail  = cg.fail.bind(cg)
export default cg
