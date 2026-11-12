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
    for (const m of line.matchAll(/'([^'\s]{1,200})'|"([^"\s]{1,200})"|(?:^|[\s(=])((?:~|\.{1,2})?\/?[\w.@+*-]+(?:\/[\w.@+*-]+)+)|(?:^|\s)([\w@+*-]+\.[\w*]{1,10}):\s*(?:No such file|Permission denied|cannot open|can't open|cannot access|cannot stat)/g)) {
      const v = m[1] ?? m[2] ?? m[3] ?? m[4]
      if ((v.includes('/') || v.includes('.')) && !cands.includes(v)) cands.push(v)
      if ((v.includes('/') || v.includes('.')) && /Permission denied|Read-only file system/i.test(line)) denied.add(v)
    }
  }
  const expand = (v: string) => v.startsWith('~') ? p.join(os.homedir(), v.slice(1)) : v
  // Motif (« laravel-*.log ») : existe si au moins un fichier du dossier y correspond ; droits lus sur le premier.
  const hit = (q: string): string | null => {
    if (!q.includes('*')) return fs.existsSync(q) ? q : null
    const re = new RegExp('^' + p.basename(q).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    try { const f = fs.readdirSync(p.dirname(q)).filter((n: string) => re.test(n)).sort()[0]; return f ? p.join(p.dirname(q), f) : null } catch { return null }
  }
  const todo: string[] = []
  for (const v of cands) {
    todo.push(v)
    const parent = p.dirname(expand(v))
    if ((denied.has(v) || !hit(expand(v))) && parent && parent !== '.' && fs.existsSync(parent) && !todo.includes(parent)) todo.push(parent)   // fichier à créer : le dossier parent porte les droits
  }
  return todo.slice(0, 5).map(v => {
    const h = hit(expand(v)), q = h ?? expand(v), d: Record<string, unknown> = { path: v.slice(0, 256), relative: !p.isAbsolute(expand(v)), exists: !!h }
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

// Résolution constatée (même règle que les SDK bash et Python) : à l'échec, on garde les seules lignes que lisent les
// sondes ; à la première réussite qui suit, les MÊMES sondes sont relancées sur ces lignes, pour comparer avant/après.
// Fichier 600 dans le dossier d'état de l'utilisateur, supprimé à la réussite.
const PROBE_LINE = /not found|No such file|Permission denied|cannot open|can.t open|cannot access|cannot stat|Read-only file system/
export function failMarker(pingKey: string): string {
  const { join } = require('path'), os = require('os')
  const base = process.env.CG_STATE_DIR || join(process.env.XDG_STATE_HOME || join(os.homedir(), '.local', 'state'), 'cronguard')
  return join(base, pingKey.replace(/[^A-Za-z0-9_-]/g, '_') + '.fail')
}
function rememberFailure(pingKey: string, output = '') {
  try {
    const fs = require('fs'), path = failMarker(pingKey)
    fs.mkdirSync(require('path').dirname(path), { recursive: true, mode: 0o700 })
    fs.writeFileSync(path, output.slice(-20000).split('\n').filter(l => PROBE_LINE.test(l)).slice(-20).join('\n'), { mode: 0o600 })
  } catch { /* le monitoring ne casse jamais le job */ }
}
function resolutionContext(pingKey: string) {
  try {
    const fs = require('fs'), path = failMarker(pingKey)
    const lines = fs.readFileSync(path, 'utf8')
    fs.unlinkSync(path)
    return runContext(lines)
  } catch { return undefined }
}

// ── Parité avec les SDK bash et Python (2026-11-12) ─────────────────────────
// Mêmes fichiers d'état (CG_STATE_DIR), mêmes champs envoyés, mêmes libellés : le serveur ne distingue pas les SDK.
const fs = require('fs') as typeof import('fs')
const pathm = require('path') as typeof import('path')
const stateBase = (pingKey: string) => failMarker(pingKey).slice(0, -5)   // <dossier>/<clé>

// Secrets masqués sur la machine du job, avant tout envoi. Copie exacte de _CG_MASK (sdk/python) : un test vérifie
// que les deux listes sont identiques. Préfixe Python (?i)/(?im) → drapeaux JS.
export const MASK_PATTERNS = [
  String.raw`(?i)\b(?:password|passwd|pwd|secret)\s*[:=]\s*(?!(?:YES|NO)\b)(?![^\s:]+:(?:\s|$))(\S+)`,
  String.raw`(?i)\b[a-z][a-z0-9+.-]*://[^\s:/@]+:([^\s@/]+)@`,
  String.raw`(?i)\bbearer\s+([A-Za-z0-9_\-.]{20,})`,
  String.raw`(?i)\bAuthorization:\s*(?:Basic|Bearer|Token)\s+([A-Za-z0-9+/=._-]{8,})`,
  String.raw`(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)`,
  String.raw`\b(AKIA[0-9A-Z]{16})\b`, String.raw`(?i)\baws_secret_access_key[\s=:]+([A-Za-z0-9/+]{40})`,
  String.raw`(?i)\b((?:sk|pk|rk|re)_(?:live|test|prod|staging)_[A-Za-z0-9_-]{16,})`,
  String.raw`(?i)\b(?:api[_-]?key|x-api-key|apikey|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[=:]\s*([A-Za-z0-9_\-.]{20,})`,
  String.raw`\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|glpat-[A-Za-z0-9_-]{20,})`,
  String.raw`\b(xox[abposr]-[A-Za-z0-9-]{10,})`, String.raw`hooks\.slack\.com/services/([A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+)`,
  String.raw`\b(AIza[0-9A-Za-z_-]{30,})`, String.raw`\b(sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,})`,
  String.raw`\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})`, String.raw`\b(npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{30,})`,
  String.raw`/bot(\d{6,}:[A-Za-z0-9_-]{30,})`, String.raw`\b(?:AccountKey|SharedAccessKey|sig)=([A-Za-z0-9+/%=]{20,})`,
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----`,
  String.raw`\bcurl\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:(\S+)`,
  String.raw`(?:\b(?:docker|podman|helm|oras)\s+(?:registry\s+)?login\b[^\n]*?\s-p|--password)(?:\s+|=)(?![-$])[\'"]?([^\s\'"]{4,})`,
  String.raw`(?i)\b(?:mysql(?:dump|admin|import)?)\b[^\n|;&]*?\s-p(?!\s)([^\s]+)`, String.raw`(?i)\bsshpass\s+-p\s*(\S+)`,
  String.raw`\b[A-Z][A-Z0-9_]*(?:PASS|PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|APIKEY|PRIVATE_KEY|AUTH)\s*=\s*[\'"]?([^\s\'"]{4,})`,
  String.raw`(?i)"(?:api_?key|apiKey|token|secret|password|passwd|access_?token|client_?secret|private_?key(?:_?id)?)"\s*:\s*"([^"]{6,})"`,
  String.raw`\b(key-[0-9a-f]{32})\b`, String.raw`\b(do[por]_v1_[a-f0-9]{64})\b`, String.raw`\b(whsec_[A-Za-z0-9]{24,})\b`,
  String.raw`https://([0-9a-f]{32})@[\w.-]*sentry\.io`, String.raw`\bldap\w+\b[^\n]*?\s-w\s+[\'"]?([^\s\'"]{4,})`,
  String.raw`(?:^|\s)AUTH\s+(?!\[)([^\s]{6,})`, String.raw`(?im)^\s*[a-z_]*(?:secret|password|passwd|token|api_?key)[a-z_]*\s*=\s*(\S{4,})`,
]
const MASK_RES = MASK_PATTERNS.map(p => {
  const m = /^\(\?([a-z]+)\)/.exec(p)
  return new RegExp(m ? p.slice(m[0].length) : p, 'gm' + (m && m[1].includes('i') ? 'i' : ''))
})
export function maskSecrets(text: string): string {
  const vals = new Set<string>()
  for (const re of MASK_RES) for (const m of text.matchAll(re)) {
    const v = m.slice(1).find(g => g) ?? m[0]
    if (v && v.length >= 4 && !/^\$\{?\w+\}?$/.test(v) && !v.includes('[REDACTED')) vals.add(v)
  }
  for (const v of [...vals].sort((a, b) => b.length - a.length)) text = text.split(v).join('[REDACTED]')
  return text
}

// Empreinte d'une réussite (même règle que _cg_fingerprint) : le job Node est le script lancé, ses arguments et
// l'interpréteur. Jamais une valeur de variable ni un contenu de fichier.
type Fingerprint = { command: string; path: string; cwd: string; vars: string[]; files: Record<string, string>; tools: Record<string, string> }
function fingerprint(): Fingerprint {
  const cmd = process.argv.slice(1).join(' ').slice(0, 1000)
  const fp: Fingerprint = {
    command: cmd ? require('crypto').createHash('sha256').update(cmd).digest('hex').slice(0, 16) : '',
    path: (process.env.PATH ?? '').slice(0, 1024), cwd: process.cwd().slice(0, 256),
    vars: Object.keys(process.env).filter(k => /^[A-Z][A-Z0-9_]*$/.test(k)).sort().slice(0, 200),
    files: {}, tools: { node: process.version },
  }
  for (const w of cmd.split(/\s+/).slice(0, 40)) {
    try { if ((w.includes('/') || w.includes('.')) && fs.statSync(w).isFile()) { const st = fs.statSync(w); fp.files[w.slice(0, 200)] = `${st.size}:${Math.floor(st.mtimeMs / 1000)}` } } catch { /* absent */ }
  }
  return fp
}
const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (s: number) => { const d = new Date(s * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
export function fingerprintDiff(old: Partial<Fingerprint>, cur: Fingerprint) {
  const ch: Array<Record<string, string>> = []
  if (old.command && old.command !== cur.command) ch.push({ kind: 'command', label: 'commande modifiée' })
  for (const [k, label] of [['path', 'PATH'], ['cwd', 'dossier de lancement']] as const)
    if (old[k] != null && old[k] !== cur[k]) ch.push({ kind: 'env', label, before: String(old[k]).slice(0, 256), after: String(cur[k]).slice(0, 256) })
  for (const v of (old.vars ?? []).filter(v => !cur.vars.includes(v)).sort().slice(0, 10))
    ch.push({ kind: 'var', label: `variable ${v} absente depuis la dernière réussite` })
  const show = (s?: string) => s == null ? '—' : `${s.split(':')[0]} octets, ${localTime(Number(s.split(':')[1]))}`
  const of = old.files ?? {}, nf = cur.files
  for (const f of [...new Set([...Object.keys(of), ...Object.keys(nf)])].sort())
    if (f in of && of[f] !== nf[f]) ch.push({ kind: 'file', label: f in nf ? `${f} modifié depuis la dernière réussite` : `${f} disparu`, before: show(of[f]), after: show(nf[f]) })
  const ot = old.tools ?? {}
  for (const t of Object.keys(ot).filter(t => t in cur.tools).sort())
    if (ot[t] !== cur.tools[t]) ch.push({ kind: 'tool', label: `version de ${t}`, before: ot[t], after: cur.tools[t] })
  return ch.slice(0, 20)
}
function writePrivate(file: string, data: string) {
  fs.mkdirSync(pathm.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, data, { mode: 0o600 })
}
function saveFingerprint(pingKey: string) {
  try { writePrivate(stateBase(pingKey) + '.ok.json', JSON.stringify(fingerprint())) } catch { /* jamais bloquant */ }
}
function changesSinceSuccess(pingKey: string) {
  try { return fingerprintDiff(JSON.parse(fs.readFileSync(stateBase(pingKey) + '.ok.json', 'utf8')), fingerprint()) } catch { return [] }
}

// Sorties attendues (CG_EXPECT, même syntaxe que bash/Python) : « réussi mais n'a rien produit ».
// shortcut: jokers (* ?) dans le nom de fichier seulement, pas dans les dossiers ; passer à fs.globSync quand Node 22 sera le minimum.
export function checkExpect(spec: string, started: number) {
  const units: Record<string, number> = { k: 1024, m: 1024 ** 2, g: 1024 ** 3, '': 1 }
  const secs: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
  return spec.split(';').map(x => x.trim()).filter(Boolean).slice(0, 5).map(item => {
    const [pat, ...rest] = item.split(/\s+/)
    const opts = Object.fromEntries(rest.filter(p => p.includes('=')).map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]))
    const mm = /^(\d+)([kKmMgG]?)$/.exec(opts.min ?? '1'), minimum = mm ? Number(mm[1]) * units[mm[2].toLowerCase()] : 1
    const a = /^(\d+)([smhd])$/.exec(opts.age ?? ''), oldest = a ? Date.now() / 1000 - Number(a[1]) * secs[a[2]] : started - 2
    const full = pat.replace(/^~(?=\/)/, require('os').homedir()), dir = pathm.dirname(full)
    const re = new RegExp('^' + pathm.basename(full).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    let hits: Array<{ p: string; st: import('fs').Stats }> = []
    try { hits = fs.readdirSync(dir).filter(n => re.test(n)).map(n => ({ p: pathm.join(dir, n), st: fs.statSync(pathm.join(dir, n)) })).sort((x, y) => x.st.mtimeMs - y.st.mtimeMs) } catch { /* dossier absent */ }
    const res: Record<string, unknown> = { pattern: pat.slice(0, 200), ok: false }
    if (!hits.length) { res.reason = 'absent'; return res }
    const { p, st } = hits[hits.length - 1]
    Object.assign(res, { path: p.slice(0, 200), size: st.size, mtime: Math.floor(st.mtimeMs / 1000) })
    if (st.mtimeMs / 1000 < oldest) res.reason = a ? `plus vieux que ${opts.age}` : 'pas modifié pendant cette exécution'
    else if (st.size < minimum) res.reason = st.size === 0 ? 'vide' : `trop petit (${st.size} octets, minimum ${minimum})`
    else res.ok = true
    return res
  })
}

// Réseau (même règle que _cg_net) : hôtes cités par une erreur réseau → DNS puis TCP, 2 s max, sans rien envoyer.
// En plus pour Node : « getaddrinfo ENOTFOUND hôte » (message natif de Node, sans port).
const PORTS: Record<string, number> = { http: 80, https: 443, ftp: 21, postgres: 5432, postgresql: 5432, mysql: 3306, redis: 6379, amqp: 5672, mongodb: 27017, smtp: 25, ldap: 389, ssh: 22 }
const NET_ERR = /refused|timed? ?out|resolve|unreachable|could not connect|couldn.t connect|no route|getaddrinfo|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|Name or service not known|Temporary failure in name resolution|Connection reset/i
export async function netProbe(text: string) {
  if (process.env.CG_PROBE_NET === '0') return []
  const url = /\b([a-z][a-z0-9+.-]*):\/\/(?:[^@/\s]+@)?([A-Za-z0-9.-]+)(?::(\d{1,5}))?/g
  const cands: Array<[string, number | undefined]> = []
  for (const line of text.split('\n')) {
    if (!NET_ERR.test(line)) continue
    for (const m of line.matchAll(url)) cands.push([m[2], m[3] ? Number(m[3]) : PORTS[m[1].toLowerCase()]])
    for (const m of line.matchAll(/\b((?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+|localhost|\d+\.\d+\.\d+\.\d+)(?::|,? port | port )(\d{1,5})\b/g)) cands.push([m[1], Number(m[2])])
    for (const m of line.matchAll(/(?:resolve host:? '?|ENOTFOUND )([A-Za-z0-9.-]+)/g)) cands.push([m[1], undefined])
  }
  const best = new Map<string, number | undefined>()
  for (const [h, p] of cands) if (!best.has(h) || (best.get(h) == null && p)) best.set(h, p)
  const dns = require('dns').promises, net = require('net')
  return Promise.all([...best].slice(0, 3).map(async ([host, port]) => {
    const r: Record<string, unknown> = { host: host.slice(0, 253), port: port ?? 0 }
    let ip: string
    try { ip = (await Promise.race([dns.lookup(host), new Promise((_, no) => setTimeout(no, 2000))]) as { address: string }).address; r.dns = 'ok' }
    catch { r.dns = 'fail'; return r }
    if (!port) return r
    r.tcp = await new Promise(done => {
      const s = net.connect({ host: ip, port, timeout: 2000 })
      s.on('connect', () => { s.destroy(); done('open') })
      s.on('timeout', () => { s.destroy(); done('timeout') })
      s.on('error', (e: NodeJS.ErrnoException) => done(e.code === 'ECONNREFUSED' ? 'refused' : 'unreachable'))
    })
    return r
  }))
}

// Mémoire et disque. Pas de compteur OOM : si Node est tué par le noyau, le SDK meurt avec lui (le ping absent alerte).
function resources(text: string) {
  const res: Record<string, unknown> = {}
  try {
    const line = fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find(l => l.startsWith('0::'))
    const d = line ? '/sys/fs/cgroup' + line.slice(3).trim().replace(/\/$/, '') : ''
    for (const [f, k] of [['memory.max', 'memMax'], ['memory.peak', 'memPeak']]) try { res[k] = fs.readFileSync(`${d}/${f}`, 'utf8').trim().slice(0, 32) } catch { /* pas de cgroup v2 */ }
  } catch { /* pas Linux */ }
  const full = text.split('\n').filter(l => /No space left|ENOSPC|Disk quota exceeded|disk full/i.test(l))
    .flatMap(l => [...l.matchAll(/'(\/[^']+)'|(?:^|\s)(\/[\w./@+-]+)/g)].map(m => m[1] || m[2]))
  const disk: Array<Record<string, unknown>> = [], seen = new Set<string>()
  for (const p of [...full.slice(0, 3), process.cwd()]) {
    let q = p
    try { if (!fs.statSync(q).isDirectory()) q = pathm.dirname(q) } catch { q = pathm.dirname(q) }
    try {
      const st = (fs as unknown as { statfsSync: (p: string) => { bavail: number; bsize: number; blocks: number; type: number } }).statfsSync(q)
      const key = `${st.type}:${st.blocks}`
      if (seen.has(key)) continue
      seen.add(key); disk.push({ path: p.slice(0, 200), free: st.bavail * st.bsize, total: st.blocks * st.bsize })
    } catch { /* statfs absent (Node < 18.15) ou chemin absent */ }
  }
  if (disk.length) res.disk = disk.slice(0, 4)
  return res
}

// Étapes (cgStep) : tenues par exécution de monitor() (AsyncLocalStorage), donc justes même si plusieurs jobs
// tournent dans le même processus.
type Run = { steps: Array<{ name: string; at: number }>; overlap?: { pid: number; since: number } }
const runs = new (require('async_hooks').AsyncLocalStorage)() as import('async_hooks').AsyncLocalStorage<Run>
export function cgStep(name: string) { runs.getStore()?.steps.push({ name: String(name).slice(0, 60), at: Date.now() }) }

export class CronGuard {
  constructor(private readonly baseUrl: string) {}

  async success(pingKey: string, opts: PingOptions = {}) {
    // Sorties attendues (CG_EXPECT) : réussi sans le fichier attendu, vide ou pas récrit = échec (code 0).
    const spec = process.env.CG_EXPECT
    if (spec) {
      const res = checkExpect(spec, Date.now() / 1000 - (opts.durationMs ?? 0) / 1000)
      const bad = res.filter(r => !r.ok)
      if (bad.length) return this.fail(pingKey, { ...opts, exitCode: 0, expect: res,
        output: 'cronguard: sortie attendue non conforme : ' + bad.map(r => `${r.path ?? r.pattern} (${r.reason})`).join('; ') })
    }
    const context = resolutionContext(pingKey)
    const data = await this.ping(pingKey, { status: 'success', ...opts, ...(context ? { context } : {}) })
    saveFingerprint(pingKey)
    return data
  }

  async fail(pingKey: string, opts: PingOptions & { expect?: unknown[] } = {}) {
    const { expect, ...rest } = opts
    const output = rest.output != null ? maskSecrets(rest.output) : undefined   // masqué sur la machine du job, avant tout envoi
    const context: Record<string, unknown> = runContext(output)
    const changed = changesSinceSuccess(pingKey)
    if (changed.length) context.changed = changed
    if (expect) context.expect = expect
    const res = resources(output ?? '')
    if (Object.keys(res).length) context.resources = res
    try { const net = await netProbe(output ?? ''); if (net.length) context.net = net } catch { /* jamais bloquant */ }
    rememberFailure(pingKey, output)
    return this.ping(pingKey, { status: 'fail', ...rest, ...(output != null ? { output } : {}), context })
  }

  // ── Wrapper "fire and forget" ─────────────────────────────────────────────
  // Exécute fn(), mesure la durée, capte les erreurs, envoie le ping.
  // Ne lève jamais d'erreur liée au monitoring pour ne pas casser le job.

  async monitor<T extends MonitorResult>(
    pingKey: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // Chevauchement : même fichier verrou que bash/Python (« pid début ») ; pid encore vivant = l'exécution précédente tourne.
    const lock = stateBase(pingKey) + '.lock', run: Run = { steps: [] }
    try {
      const [pid, since] = fs.readFileSync(lock, 'utf8').split(/\s+/).map(Number)
      if (pid && pid !== process.pid) { process.kill(pid, 0); run.overlap = { pid, since } }
    } catch { /* pas de verrou, ou processus mort */ }
    try { writePrivate(lock, `${process.pid} ${Math.floor(Date.now() / 1000)}`) } catch { /* jamais bloquant */ }
    try { return await runs.run(run, () => this.runMonitored(pingKey, fn)) }
    finally { try { if (fs.readFileSync(lock, 'utf8').split(/\s+/)[0] === String(process.pid)) fs.unlinkSync(lock) } catch { /* déjà parti */ } }
  }

  private async runMonitored<T extends MonitorResult>(pingKey: string, fn: () => Promise<T>): Promise<T> {
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
    const run = runs.getStore(), ctx = body.context as Record<string, unknown> | undefined
    if (ctx && run?.steps.length) { ctx.steps = run.steps.slice(-20); ctx.stepsEnd = Date.now() }
    if (ctx && run?.overlap) ctx.overlap = run.overlap
    // Ne jamais perdre une panne : même file que bash/Python (<état>/queue/NNNNNNNNNNNN__clé, compteur .seq).
    const q = pathm.join(pathm.dirname(failMarker(pingKey)), 'queue')
    try {
      for (const f of fs.readdirSync(q).filter(x => x.includes('__')).sort().slice(0, 50)) {
        if ((await this.send(f.slice(f.indexOf('__') + 2), JSON.parse(fs.readFileSync(pathm.join(q, f), 'utf8')))).ok) fs.unlinkSync(pathm.join(q, f))
        else break
      }
    } catch { /* pas de file */ }
    // Noms attendus par le serveur (exit_code, duration_ms) : en camelCase ils étaient ignorés, jamais reçus.
    const { exitCode, durationMs, ...rest } = body
    body = { ...rest, ...(exitCode != null ? { exit_code: exitCode } : {}), ...(durationMs != null ? { duration_ms: durationMs } : {}) }
    if (typeof body.output === 'string') body.output = body.output.slice(0, 3000)   // le serveur refuse plus de 4000
    const sent = await this.send(pingKey, body)
    if (sent.ok) return sent.data
    try {
      fs.mkdirSync(q, { recursive: true, mode: 0o700 })
      let n = 1
      try { n = Number(fs.readFileSync(pathm.join(q, '.seq'), 'utf8').trim() || 0) + 1 } catch { /* premier */ }
      fs.writeFileSync(pathm.join(q, '.seq'), String(n))
      fs.writeFileSync(pathm.join(q, `${String(n).padStart(12, '0')}__${pingKey.replace(/[^A-Za-z0-9_-]/g, '_')}`), JSON.stringify(body), { mode: 0o600 })
      for (const old of fs.readdirSync(q).filter(x => x.includes('__')).sort().slice(0, -200)) fs.unlinkSync(pathm.join(q, old))
    } catch { /* le monitoring ne casse jamais le job */ }
  }

  // Vrai si le serveur a répondu 2xx ou 4xx (un 4xx ne passerait pas mieux plus tard).
  private async send(pingKey: string, body: unknown): Promise<{ ok: boolean; data?: unknown }> {
    try {
      const res = await axios.post(`${this.baseUrl}/ping/${pingKey}`, body,
        { timeout: 5000, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true })
      return { ok: res.status < 500, data: res.data }
    } catch { return { ok: false } }
  }
}

// ── Export fonctionnel (sans instanciation) ───────────────────────────────────

const DEFAULT_URL = process.env.CRONGUARD_URL ?? 'http://localhost:3000'
const cg = new CronGuard(DEFAULT_URL)

export const monitor   = cg.monitor.bind(cg)
export const pingOk    = cg.success.bind(cg)
export const pingFail  = cg.fail.bind(cg)
export default cg
