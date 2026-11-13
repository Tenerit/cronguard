let LANG = localStorage.getItem('cg_lang')
  || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en')
function t(k) { return (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k }
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')) })
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')) })
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')) })
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))) })
  const pt = document.getElementById('page-title')
  if (pt && typeof currentView !== 'undefined') pt.textContent = t('title.' + currentView)
  document.documentElement.lang = LANG
}
function setLang(val) {
  if (val) localStorage.setItem('cg_lang', val)
  else     localStorage.removeItem('cg_lang')
  location.reload()   // re-rend tout le chrome + les vues dynamiques proprement
}

// ─── Thème clair / sombre ─────────────────────────────────────────────────────
let THEME = localStorage.getItem('cg_theme')
  || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
function applyTheme() {
  document.documentElement.setAttribute('data-theme', THEME)
  const b = document.getElementById('theme-toggle')
  if (b) {
    b.textContent = THEME === 'light' ? '☾' : '☀'
    b.setAttribute('aria-label', THEME === 'light' ? t('a11y.themeDark') : t('a11y.themeLight'))
    b.title = b.getAttribute('aria-label')
  }
}
function toggleTheme() {
  THEME = THEME === 'light' ? 'dark' : 'light'
  localStorage.setItem('cg_theme', THEME)
  applyTheme()
}

// ─── Démo hostée (lecture seule, fixtures, aucun backend) ─────────────────────
// Activée par ?demo dans l'URL ou un hostname commençant par "demo.".
// Permet d'héberger dashboard.html n'importe où (static) comme démo cliquable.
const DEMO = /(?:[?&])demo\b/.test(location.search) || /^demo\./.test(location.hostname)

const D_NOW = Date.now()
const dISO  = (minAgo) => new Date(D_NOW - minAgo * 60000).toISOString()
function dSeries(n, { fail = [], late = [], base = 2500, jitter = 600, step = 55 } = {}) {
  const arr = []
  for (let i = 0; i < n; i++) {
    let status = fail.includes(i) ? 'failed' : late.includes(i) ? 'late' : 'success'
    const duration_ms = status === 'success' ? Math.round(base + Math.random() * jitter)
      : status === 'late' ? Math.round(base * 3.2) : 0
    arr.push({ status, duration_ms, pinged_at: dISO(i * step + 2),
      records: status === 'success' ? Math.round(5000 + Math.random() * 3000) : 0 })
  }
  return arr   // index 0 = plus récent
}

const DEMO_MON = [
  { id:'d1', name:'backup-postgres', env:'production', last_status:'ok',     schedule:'0 2 * * *',  grace_period:300, ping_key:'cg_demo_bkp', avg_duration_7d:2900, recent_pings:dSeries(16,{base:2800}) },
  { id:'d2', name:'etl-warehouse',   env:'production', last_status:'failed', schedule:'0 */4 * * *',grace_period:600, ping_key:'cg_demo_etl', avg_duration_7d:4300, recent_pings:dSeries(16,{fail:[0,6],base:4200}) },
  { id:'d3', name:'sync-invoices',   env:'production', last_status:'late',   schedule:'*/30 * * * *',grace_period:300, ping_key:'cg_demo_inv', avg_duration_7d:5800, recent_pings:dSeries(16,{late:[0],base:6000}) },
  { id:'d4', name:'reindex-search',  env:'staging',    last_status:'ok',     schedule:'0 4 * * *',  grace_period:900, ping_key:'cg_demo_idx', avg_duration_7d:1800, recent_pings:dSeries(16,{base:1750}) },
  { id:'d5', name:'send-digests',    env:'production', last_status:'ok',     schedule:'0 8 * * *',  grace_period:300, ping_key:'cg_demo_dig', avg_duration_7d:950,  recent_pings:dSeries(16,{base:900}) },
  { id:'d6', name:'cleanup-sessions',env:'production', last_status:'ok',     schedule:'0 * * * *',  grace_period:180, ping_key:'cg_demo_cln', avg_duration_7d:1200, recent_pings:dSeries(16,{fail:[8],base:1150}) },
].map(m => ({ ...m, last_ping_at: dISO(2), paused_until:null, expected_min:null, expected_max:null }))

const DEMO_AN = [
  { id:'a1', monitor_id:'d2', monitorName:'etl-warehouse', env:'production', alert_type:'fail', model_used:'knowledge', created_at:dISO(3), from_cache:false,
    confidence:'medium', data_impact:'possible', fix_minutes:15, severity:'medium', category:'network',
    ping_exit_code:1, ping_output:'ConnectionError: connect ECONNREFUSED 10.0.1.45:5439\\nAll retries exhausted. Records: 0/847392',
    evidence:['ConnectionError: connect ECONNREFUSED 10.0.1.45:5439'],
    correlated_monitors:['sync-invoices'],
    diag:{"cause":"Rien n'écoute sur l'adresse et le port appelés : service arrêté ou redémarré, mauvais port, ou service lié à une autre interface.","action":"Vérifier que le service cible tourne et écoute sur ce port (systemctl status, ss -ltnp), puis relancer le job.","prevention":"","checks":["nc -zv <hôte> <port> depuis la machine du job.","Sur la cible : ss -ltnp | grep <port>"],"severity":"medium","category":"network","confidence":"medium","data_impact":"possible","fix_minutes":15}  },
  { id:'a2', explanation:"Deux transactions ont essayé de verrouiller les mêmes lignes dans un ordre différent, et la base a annulé l'une d'elles en raison d'un deadlock. Pour résoudre le problème, relancez la transaction en prenant toujours les verrous dans le même ordre et en raccourcissant les transactions.", monitor_id:'d6', monitorName:'cleanup-sessions', env:'production', alert_type:'fail', model_used:'knowledge', created_at:dISO(60*8), from_cache:false,
    confidence:'high', data_impact:'none', fix_minutes:15, severity:'medium', category:'database',
    ping_exit_code:1, ping_output:'ERROR: deadlock detected\\nProcess 12345 waits for ShareLock on transaction 88472',
    evidence:['ERROR: deadlock detected'],
    known_fix:{"id":"db-deadlock","title":"Interblocage (deadlock) entre transactions","steps":["Relancer la transaction : un deadlock est transitoire, la base en a annulé une.","Prendre les verrous dans le même ordre partout (trier les ids avant les UPDATE).","Raccourcir les transactions ; découper les gros lots."]},
    correlated_monitors:[],
    diag:{"cause":"Deux transactions concurrentes verrouillent les mêmes lignes dans un ordre différent : la base en a annulé une (deadlock).","action":"Relancer la transaction et prendre les verrous dans le même ordre partout, avec des lots plus petits.","prevention":"","checks":["Prendre les verrous dans le même ordre partout (trier les ids avant les UPDATE).","Raccourcir les transactions ; découper les gros lots."],"severity":"medium","category":"database","confidence":"high","data_impact":"none","fix_minutes":15}  },
  { id:'a3', explanation:"Trop de requêtes ont été envoyées à l'API dans la fenêtre autorisée, ce qui a dépassé sa limite de débit. Il faut respecter le délai indiqué dans Retry-After en utilisant un étalement exponentiel des appels et en vérifiant que seul un job utilise la clé API à la fois.", monitor_id:'d3', monitorName:'sync-invoices', env:'production', alert_type:'timeout', model_used:'knowledge', created_at:dISO(28), from_cache:false,
    confidence:'high', data_impact:'none', fix_minutes:15, severity:'medium', category:'dependency',
    ping_exit_code:124, ping_output:'StripeRateLimitError: Too Many Requests\\n statusCode: 429\\n retry-after: 29',
    evidence:['StripeRateLimitError: Too Many Requests'],
    known_fix:{"id":"http-429","title":"Limite de débit de l'API atteinte (429)","steps":["Respecter l'en-tête Retry-After et réessayer avec un délai exponentiel.","Étaler les appels (moins de parallélisme, lots plus petits).","Vérifier qu'un autre job n'utilise pas la même clé au même moment."]},
    correlated_monitors:[],
    diag:{"cause":"Trop de requêtes envoyées à l'API dans la fenêtre autorisée : sa limite de débit est atteinte.","action":"Respecter Retry-After avec un délai exponentiel et étaler les appels.","prevention":"","checks":["Respecter l'en-tête Retry-After et réessayer avec un délai exponentiel.","Vérifier qu'un autre job n'utilise pas la même clé au même moment."],"severity":"medium","category":"dependency","confidence":"high","data_impact":"none","fix_minutes":15}  },
  // Résolution constatée : sortie réelle de contextDiff() (PATH fourni dans la crontab entre l'échec et la réussite).
  { id:'a4', monitor_id:'d4', monitorName:'reindex-search', env:'production', alert_type:'fail', model_used:'knowledge', created_at:dISO(60*26), from_cache:false,
    confidence:'high', data_impact:'none', fix_minutes:10, severity:'medium', category:'dependency',
    ping_exit_code:127, ping_output:'Reindexing products…\\n/opt/search/reindex.sh: line 4: es-reindex: command not found',
    evidence:['/opt/search/reindex.sh: line 4: es-reindex: command not found'],
    correlated_monitors:[],
    resolution:{"changes":[{"kind":"env","label":"PATH","before":"/usr/bin:/bin","after":"/home/search/.local/bin:/usr/bin:/bin"}],"text":"Réparation constatée : PATH : /usr/bin:/bin → /home/search/.local/bin:/usr/bin:/bin","at":dISO(60*26-38)},
    diag:{"cause":"Votre shell de connexion trouve « es-reindex » dans /home/search/.local/bin, le cron non : son PATH (/usr/bin:/bin) ne contient pas ce dossier.","action":"Appeler /home/search/.local/bin/es-reindex en chemin absolu, ou ajouter PATH=/home/search/.local/bin:/usr/bin:/bin en tête de la crontab.","prevention":"","checks":["cron démarre avec un PATH réduit (souvent /usr/bin:/bin) : un outil sous /usr/local/bin, nvm ou pyenv y est invisible.","Appeler la commande en chemin absolu (command -v <outil> pour le trouver), ou définir PATH= en tête de la crontab."],"category":"dependency","data_impact":"none"} },
].map(a => ({ ...a, diagnosis: JSON.stringify(a.diag), checks: a.diag.checks }))   // evidence / known_fix : sorties réelles de evidenceLines() / knownFix() sur ces logs

const DEMO_CLIENT = { id:'demo', email:'demo@cronguard.dev', plan:'pro', slack_webhook:null, webhook_url:null,
  escalation_after_min:30, escalation_email:null, escalation_webhook:null, monitor_count:DEMO_MON.length, created_at:dISO(60*24*42) }
const DEMO_TEAM = [
  { id:'t1', email:'demo@cronguard.dev', role:'owner', invited_by:null },
  { id:'t2', email:'sre@cronguard.dev',  role:'admin', invited_by:'demo@cronguard.dev' },
  { id:'t3', email:'view@cronguard.dev', role:'viewer',invited_by:'demo@cronguard.dev' },
]
const DEMO_MAINT = [
  { id:'m1', label:'Maintenance hebdo', cron_expr:'0 3 * * 0', duration_min:60, active:true, monitor_id:null, active_now:false },
]
const DEMO_IMPACT = { incidents:7, affectedMonitors:3, avgMttrMs:11*60000, totalDowntimeMs:96*60000, dataLoss:1, week:2, documented:4,
  recurring:[{ name:'etl-warehouse', n:3 }, { name:'sync-invoices', n:2 }] }

function demoOverview() {
  const c = { ok:0, failed:0, late:0, unknown:0 }
  DEMO_MON.forEach(m => { c[m.last_status === 'ok' ? 'ok' : m.last_status] = (c[m.last_status==='ok'?'ok':m.last_status]||0)+1 })
  return { monitors:{ ok:c.ok, failed:c.failed, late:c.late, unknown:c.unknown, total:DEMO_MON.length }, ai:{ today:DEMO_AN.length }, alerts:[] }
}
function demoLogs() {
  const rows = []
  DEMO_MON.forEach(m => m.recent_pings.slice(0,4).forEach(p => {
    const an = DEMO_AN.find(a => a.monitor_id === m.id)
    rows.push({ monitor_id:m.id, monitor_name:m.name, env:m.env, status:p.status, duration_ms:p.duration_ms,
      records:p.records, pinged_at:p.pinged_at, exit_code:p.status==='failed'?1:0,
      diagnosis:(p.status!=='success' && an)?an.diagnosis:null })
  }))
  return rows.sort((a,b) => new Date(b.pinged_at) - new Date(a.pinged_at)).slice(0,40)
}
// Démo de la boucle d'apprentissage (fixtures) : une panne corrigée par l'équipe, une fiche d'équipe déjà active.
const DEMO_LEARN = {
  candidates:   [{ signature:'exporter: error quota table locked by maintenance window <n>', occurrences:3, jobs:['export-reports','etl-warehouse'],
                   lastSeen:dISO(60*5), cause:"Cause non établie (aucune fiche ne correspond) : le job s'arrête sur « exporter: ERROR quota table locked by maintenance window 7 ».",
                   verifiedFix:'Attendre la fin de la maintenance (02h30) puis relancer, ou décaler le cron à 03h.', analysisId:'demo-a9' }],
  unrecognized: [{ signature:'exporter: error quota table locked by maintenance window <n>', occurrences:3, jobs:['export-reports','etl-warehouse'], verifiedFix:'x' },
                 { signature:'ledger: fatal reconciliation drift after <dur>, delta <size>', occurrences:2, jobs:['sync-invoices'], verifiedFix:null }],
  stats:        { learned: 4, unknown: 5, days: 30 },
}
const DEMO_TEAM_FIXES = [{ id:'demo-f1', match:'stale advisory lock', title:'Verrou consultatif orphelin', created_by:'ops@acme.example', created_at:dISO(60*24*6),
  cause:"Panne déjà rencontrée et corrigée par votre équipe : « reconcile: ERROR stale advisory lock held by dead session ».",
  action:'pg_terminate_backend sur la session morte puis relance du job.', category:'database' }]

function demoPreview(body) {
  const logs = (body.logs||'').toLowerCase()
  const pick =
    /econnrefused|refused|unreachable|dns/.test(logs) ? DEMO_AN[0].diag :
    /deadlock|lock|postgres|sql/.test(logs)           ? DEMO_AN[1].diag :
    /429|rate.?limit|stripe|api/.test(logs)           ? DEMO_AN[2].diag :
    // Fiche oom-killed (moteur actuel) ; explication = sortie réelle de l'essai 4b, cas oom-killer-137.
    /oom|out of memory|killed|137/.test(logs)         ? { cause:"Le processus a dépassé la mémoire disponible ou la limite du conteneur : le noyau l'a tué (OOM killer, code 137).", action:"Réduire le pic mémoire (traitement par lots) ou relever la limite mémoire du conteneur ou de la machine.", prevention:'', checks:['dmesg -T | grep -i "killed process"'], severity:'critical', category:'resources', confidence:'high', data_impact:'possible', fix_minutes:30,
      explanation:"Le processus a été tué par le noyau en raison d'une mémoire insuffisante (OOM killer). Vous pouvez réduire la consommation de mémoire en traitant les données par lots ou augmenter la limite de mémoire du conteneur ou de la machine." } :
    { cause:'Démo : vos logs ne sont pas analysés ici.', action:'Lancez CronGuard en local pour analyser vos propres logs.', prevention:'', checks:[], severity:'medium', category:'unknown', confidence:'low', data_impact:'possible', fix_minutes:0 }
  const same = DEMO_AN.find(a => a.diag === pick)   // explications réelles de l'essai 4b (eval/archive/EXPLAIN.trial4b.md)
  return { ...pick, explanation: pick.explanation ?? same?.explanation ?? null,
    model:'exemple enregistré, vos logs ne sont pas analysés', fromCache:false, _meta:{ logs_length:(body.logs||'').length } }
}

// Crontab d'exemple : 5 lignes réelles du jeu de l'essai 2 du nommage (questions StackExchange).
const DEMO_CRONTAB = `# crontab -l
MAILTO=ops@example.com
0 5 * * 1-5 /home/cvs/backup/cvs_backupScript.sh
* 01 * * 1 /home/myname/certbot-auto --quiet
*/5 * * * * /home/ubuntu/s3syncer.sh
0 17 * * * sudo tar -cpzf backupfolder/localhost.tar.gz /var/www
* * * * * cd /home/administrator/www/my_application && RAILS_ENV=production /usr/bin/env rake import:import_twitter >> cron.log 2>> error.log`
const DEMO_SUGGEST = {
  '/home/cvs/backup/cvs_backupScript.sh': { name:'cvs-backup-script', role:'Effectue une sauvegarde du système CVS', critical:true, when:'du lundi au vendredi, à 05:00' },
  '/home/myname/certbot-auto --quiet': { name:'renew-ssl-certs', role:'Renouvelle les certificats SSL', critical:false, when:'le lundi, toutes les minutes de 01:00 à 01:59' },
  '/home/ubuntu/s3syncer.sh': { name:'s3-sync', role:'Synchronise le contenu avec S3', critical:true, when:'toutes les 5 minutes' },
  'sudo tar -cpzf backupfolder/localhost.tar.gz /var/www': { name:'create-localhost-backup', role:'Crée une sauvegarde du dossier www local', critical:true, when:'tous les jours, à 17:00' },
  'cd /home/administrator/www/my_application && RAILS_ENV=production /usr/bin/env rake import:import_twitter >> cron.log 2>> error.log': { name:'import-twitter-data', role:"Importe les données Twitter dans l'application", critical:false, when:'toutes les minutes' },
}

async function demoApi(path, opts={}) {
  const method = (opts.method || 'GET').toUpperCase()
  const body   = opts.body ? JSON.parse(opts.body) : {}
  // Playground : vraie latence simulée pour montrer le spinner
  if (path.startsWith('/monitors/analyze/preview')) {
    await new Promise(r => setTimeout(r, 1400 + Math.random()*1200))
    return demoPreview(body)
  }
  // Import de crontab : sorties réelles de l'essai 2 (eval/archive/JOB-NAMES-2.md), recopiées telles quelles.
  if (path === '/monitors/suggest-name') {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 500))
    return DEMO_SUGGEST[body.command] ?? { name: null, role: null, critical: null, when: null }
  }
  // Écritures désactivées en démo
  if (method !== 'GET') { toast(t('demo.readonly'), 'info'); return { ok:true, demo:true } }

  if (path.startsWith('/dashboard/overview')) return demoOverview()
  if (path.startsWith('/dashboard/logs'))     return demoLogs()
  if (path.startsWith('/dashboard/analyses'))  return DEMO_AN
  if (path.startsWith('/dashboard/impact'))    return DEMO_IMPACT
  if (path.startsWith('/clients/me'))          return DEMO_CLIENT
  if (path.startsWith('/maintenance-windows')) return DEMO_MAINT
  if (path.startsWith('/team/members'))        return DEMO_TEAM
  if (path.startsWith('/team/invitations'))    return []
  if (path.startsWith('/clients/learning'))    return DEMO_LEARN
  if (path.startsWith('/clients/fixes/draft/')) return { match:'quota table locked by maintenance window', title:'quota table locked by maintenance window', cause:'Panne déjà rencontrée et corrigée par votre équipe : « quota table locked by maintenance window ».', action:'Attendre la fin de la maintenance (02h30) puis relancer, ou décaler le cron à 03h.', category:'database' }
  if (path.startsWith('/clients/fixes'))       return DEMO_TEAM_FIXES
  if (path === '/monitors')                    return DEMO_MON
  const histM = path.match(/^\/monitors\/(\w+)\/history/)
  if (histM) { const m = DEMO_MON.find(x => x.id === histM[1]); return (m?.recent_pings||[]).map(p => ({ ...p, output:null, exit_code:p.status==='failed'?1:0 })) }
  const anM = path.match(/^\/monitors\/(\w+)\/analyses/)
  if (anM) return DEMO_AN.filter(a => a.monitor_id === anM[1])
  const oneM = path.match(/^\/monitors\/(\w+)$/)
  if (oneM) return DEMO_MON.find(x => x.id === oneM[1]) || {}
  return []
}

function startDemo() {
  API_KEY = 'cg_demo_readonly'; BASE_URL = 'https://cron.your-server.io'   // affichage curl/docs ; api() court-circuite vers demoApi
  window._activeModel = 'qwen2.5:7b (démo)'
  document.body.classList.add('is-demo')
  boot()
}

// ─── State ────────────────────────────────────────────────────────────────────
// Servi par l'API (cas normal) : même adresse. Ouvert en fichier : l'API locale par défaut.
let BASE_URL      = localStorage.getItem('cg_url') || (location.protocol.startsWith('http') ? location.origin : 'http://localhost:3000')
let API_KEY       = localStorage.getItem('cg_key') || ''
let monitors      = []
let searchText    = ''
let currentFilter = 'all'
let currentView   = 'dashboard'
let anLocked      = false
let anMonitor     = null
let activeMonitor = null
let editMonitorId = null
let timer         = null
let TZ            = localStorage.getItem('cg_tz') || ''
const pendingAnalysis = new Set() // monitor IDs avec analyse en attente

// Live refresh timestamp
let lastRefresh   = null
setInterval(() => {
  const el = document.getElementById('live-ts')
  if (!el || !lastRefresh) return
  const s = Math.round((Date.now() - lastRefresh) / 1000)
  el.textContent = s < 5 ? 'live' : `MàJ ${s}s`
}, 2000)

// Journal
let logsData      = []
let logFilter     = 'all'   // all | fail | ai
let logSearch     = ''
// Analyses IA
let analysesData  = []
let anSevFilter   = 'all'
let anCatFilter   = 'all'
let anSearch      = ''

// ─── Timezone ────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—'
  const opts = { hour:'2-digit', minute:'2-digit', second:'2-digit' }
  if (TZ) opts.timeZone = TZ
  try { return new Date(iso).toLocaleTimeString('fr-FR', opts) } catch { return new Date(iso).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) }
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const opts = { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }
  if (TZ) opts.timeZone = TZ
  try { return new Date(iso).toLocaleString('fr-FR', opts) } catch { return new Date(iso).toLocaleString('fr-FR', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }) }
}

// ─── Health score ─────────────────────────────────────────────────────────────
function healthScore(m) {
  const pings  = m.recent_pings || []
  if (!pings.length) return 50
  const ok     = pings.filter(p => p.status === 'success').length
  const base   = Math.round(ok / pings.length * 100)
  const hasAnom = m.last_status === 'late' ? -10 : m.last_status === 'failed' ? -25 : 0
  return Math.max(0, Math.min(100, base + hasAnom))
}

function healthColor(score) {
  if (score >= 90) return 'var(--green)'
  if (score >= 70) return 'var(--amber)'
  return 'var(--red)'
}

// ─── Duration trend (7j) ─────────────────────────────────────────────────────
function calcTrend(history) {
  const durs = history.filter(h => h.status==='success' && h.duration_ms > 0).map(h => h.duration_ms)
  if (durs.length < 4) return null
  const mid  = Math.floor(durs.length/2)
  const avg1 = durs.slice(0,mid).reduce((a,b)=>a+b,0) / mid
  const avg2 = durs.slice(mid).reduce((a,b)=>a+b,0) / (durs.length-mid)
  if (avg1 <= 0) return null
  return Math.round((avg2-avg1)/avg1*100)
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts={}) {
  if (DEMO) return demoApi(path, opts)   // démo hostée : fixtures, aucun backend
  const r = await fetch(BASE_URL+path, {
    ...opts, headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json', ...opts.headers }
  })
  if (!r.ok) { const t=await r.text(); throw new Error(`${r.status}: ${t}`) }
  return r.json()
}

// ─── Toasts ───────────────────────────────────────────────────────────────────
function toast(msg, type='info', ms=3000) {
  const c = document.getElementById('toasts')
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  c.appendChild(el)
  setTimeout(() => el.remove(), ms)
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const authUrl = () => document.getElementById('auth-url').value.trim().replace(/\/$/, '') || BASE_URL

async function login() {
  const key = document.getElementById('auth-key').value.trim()
  const url = authUrl()
  if (!key) { document.getElementById('auth-err').textContent = t('auth.errKey'); return }
  API_KEY = key; BASE_URL = url
  try {
    const r = await fetch(url+'/dashboard/overview', { headers: { 'X-API-Key': key } })
    if (!r.ok) throw new Error()
    localStorage.setItem('cg_key', key); localStorage.setItem('cg_url', url)
    boot()
  } catch { document.getElementById('auth-err').textContent = t('auth.errInvalid') }
}

// Créer son compte depuis l'écran de connexion (même route que l'ancienne commande curl, déjà limitée en débit).
async function registerAccount() {
  const email = document.getElementById('reg-email').value.trim()
  const err = document.getElementById('auth-err')
  err.textContent = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = t('auth.errEmail'); return }
  try {
    const r = await fetch(authUrl() + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    if (r.status === 409) { err.textContent = t('auth.errExists'); return }
    const d = await r.json()
    if (!r.ok || !d.apiKey) throw new Error()
    document.getElementById('auth-key').value = d.apiKey   // prête pour « Connexion »
    document.getElementById('reg-key').textContent = d.apiKey
    document.getElementById('reg-result').hidden = false
  } catch { err.textContent = t('auth.errRegister') }
}
function copyNewKey() { copyText(document.getElementById('reg-key').textContent, t('toast.apiKeyCopied')) }

function logout() {
  clearInterval(timer)
  localStorage.removeItem('cg_key')
  document.getElementById('app').style.display = 'none'
  document.getElementById('auth-overlay').style.display = 'flex'
}

async function boot() {
  document.getElementById('auth-overlay').style.display = 'none'
  document.getElementById('app').style.display = 'grid'
  updateDocUrls()
  showSkeletons()
  if (!DEMO) fetch(BASE_URL+'/health').then(r=>r.json()).then(h=>{ if(h.model) window._activeModel=h.model }).catch(()=>{})
  await refreshAll()
  // Lien « ce qui a réglé la panne » reçu dans l'alerte (mail/Slack) : ouvre le formulaire direct.
  const fixLink = /^#fix=([\w-]+)$/.exec(location.hash)
  if (fixLink) { history.replaceState(null, '', location.pathname + location.search); recordFix(fixLink[1]) }
  loadClientInfo()
  loadImpact()
  timer = setInterval(refreshAll, 15000)
  setTimeout(() => startTour(), 700)   // visite guidée au premier lancement (no-op si déjà vue)
}

// ─── Skeletons de chargement (premier rendu) ─────────────────────────────────
function showSkeletons() {
  const rows = (n) => Array.from({length:n}, () => `
    <div class="skel-row" aria-hidden="true">
      <div class="skel skel-dot"></div>
      <div class="skel" style="width:60%"></div>
      <div class="skel" style="width:80%"></div>
      <div class="skel" style="width:70%"></div>
      <div class="skel" style="width:60%"></div>
    </div>`).join('')
  const logs = (n) => Array.from({length:n}, () => `
    <div class="skel-le" aria-hidden="true">
      <div class="skel"></div><div class="skel"></div><div class="skel" style="width:70%"></div>
    </div>`).join('')
  const set = (id, html) => { const el = document.getElementById(id); if (el && el.querySelector('.empty')) el.innerHTML = html }
  set('monitors-list', rows(4))
  set('monitors-list-full', rows(6))
  set('log-body', logs(6))
  set('log-body-full', logs(8))
}

// ─── Data ─────────────────────────────────────────────────────────────────────
async function refreshAll() {
  await Promise.allSettled([loadOverview(), loadMonitors(), loadLogs('dash')])
  if (currentView === 'logs') renderJournal()   // même logsData, vue complète à jour
  if (!anLocked) loadAnalyses()
}

async function loadOverview() {
  try {
    const d = await api('/dashboard/overview')
    document.getElementById('s-ok').textContent    = d.monitors.ok
    document.getElementById('s-fail').textContent  = d.monitors.failed
    document.getElementById('s-late').textContent  = d.monitors.late
    document.getElementById('s-ai').textContent    = d.ai.today
    document.getElementById('s-total').textContent = `/ ${d.monitors.total}`
    const alerts = d.monitors.failed + d.monitors.late
    const b = document.getElementById('alert-badge')
    b.textContent = alerts; b.style.display = alerts ? '' : 'none'
    document.title = alerts ? `(${alerts}) CronGuard` : 'CronGuard'
    lastRefresh = Date.now()
  } catch(e) { console.error(e) }
}

async function loadMonitors() {
  try {
    monitors = await api('/monitors')
    let totalPings = 0, successPings = 0
    monitors.forEach(m => {
      const p = m.recent_pings || []
      totalPings   += p.length
      successPings += p.filter(x => x.status === 'success').length
      // Détecte les monitors en échec récent sans analyse → marque comme pending
      const isFailed = m.last_status === 'failed'
      const isRecent = m.last_ping_at && (Date.now() - new Date(m.last_ping_at).getTime()) < 120000
      if (isFailed && isRecent && !pendingAnalysis.has(m.id)) {
        // On vérifie s'il y a une analyse très récente dans les logs
        const recentLog = p[0]
        if (recentLog && (recentLog.status==='failed'||recentLog.status==='fail')) {
          markPending(m.id)
        }
      }
    })
    const uptime = totalPings > 0 ? Math.round(successPings/totalPings*100) : 100
    document.getElementById('s-uptime').textContent = uptime + '%'
    document.getElementById('m-count-dash').textContent = monitors.length
    document.getElementById('m-count-full').textContent = monitors.length
    renderMonitors('dash')
    renderMonitors('full')
    renderAlertBanner(monitors)
  } catch(e) { toast(t('toast.loadErr')+' '+e.message, 'err') }
}

function renderAlertBanner(list) {
  const el = document.getElementById('alert-banner')
  if (!el) return
  const failed = list.filter(m => m.last_status==='failed' && !(m.paused_until && new Date(m.paused_until)>new Date()))
  const late   = list.filter(m => m.last_status==='late' && !(m.paused_until && new Date(m.paused_until)>new Date()))
  if (!failed.length && !late.length) { el.innerHTML = ''; return }
  const cls   = failed.length ? 'crit' : 'warn'
  const dot   = failed.length ? 'var(--red)' : 'var(--amber)'
  const parts = []
  if (failed.length) parts.push(`${failed.length} ${t('ab.failing')}`)
  if (late.length)   parts.push(`${late.length} ${t('ab.late')}`)
  const chips = [
    ...failed.map(m => `<span class="ab-chip fail" data-click="openDrawer" data-args="${esc(JSON.stringify([`${m.id}`]))}">${esc(m.name)}</span>`),
    ...late.map(m   => `<span class="ab-chip late" data-click="openDrawer" data-args="${esc(JSON.stringify([`${m.id}`]))}">${esc(m.name)}</span>`)
  ].join('')
  el.innerHTML = `<div class="alert-banner ${cls}">
    <div class="ab-icon"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dot};box-shadow:0 0 8px ${dot}"></span></div>
    <div class="ab-body">
      <div class="ab-title">${parts.join(' · ')} — ${t('ab.investigate')}</div>
      <div class="ab-items">${chips}</div>
    </div>
  </div>`
}

async function loadLogs(target) {
  try {
    logsData = await api('/dashboard/logs?limit=80')
    renderLogs(target)
  } catch(e) { console.error(e) }
}

function fmtDur(ms) { return ms > 60000 ? Math.round(ms/1000)+'s' : ms+'ms' }

async function loadAnalyses(monitorId) {
  try {
    let analyses
    if (monitorId) {
      analyses = await api(`/monitors/${monitorId}/analyses`)
      const mon = monitors.find(m => m.id === monitorId)
      analyses.forEach(a => {
        a.monitorName = mon?.name || '?'
        // ping_output et ping_exit_code viennent directement de l'API (JOIN pings)
        if (typeof a.correlated_monitors === 'string') {
          try { a.correlated_monitors = JSON.parse(a.correlated_monitors) } catch { a.correlated_monitors = [] }
        }
      })
    } else {
      analyses = await api('/dashboard/analyses?limit=15')
      analyses.forEach(a => {
        const m = monitors.find(m => m.id === a.monitor_id)
        a.monitorName = m?.monitor_name || m?.name || a.monitor_name || '?'
        if (typeof a.correlated_monitors === 'string') {
          try { a.correlated_monitors = JSON.parse(a.correlated_monitors) } catch { a.correlated_monitors = [] }
        }
      })
    }
    analysesData = analyses
    renderAnalyses()
  } catch(e) { console.error(e) }
}

// ─── Impact / MTTR (preuve de valeur) ─────────────────────────────────────────
function fmtMs(ms) {
  if (!ms || ms < 0) return '0'
  const s = Math.round(ms/1000)
  if (s < 60)  return s+'s'
  const m = Math.round(s/60)
  if (m < 60)  return m+'min'
  const h = Math.floor(m/60), rm = m%60
  if (h < 24)  return rm ? `${h}h${rm}` : `${h}h`
  const days = Math.floor(h/24), rh = h%24
  return rh ? `${days}j${rh}h` : `${days}j`
}

async function loadImpact() {
  try { renderImpact(await api('/dashboard/impact?days=30')) }
  catch(e) { console.error(e) }
}

function renderImpact(d) {
  // MTTR strip dans le dashboard
  const ms = document.getElementById('mttr-strip')
  if (ms) {
    if (d.incidents) {
      ms.innerHTML = `
        <div class="mttr-card">
          <div class="mttr-label">${t('mttr.incidents')}</div>
          <div class="mttr-val">${d.incidents}</div>
          <div class="mttr-sub">${d.affectedMonitors} ${t('mttr.incidentsSub')}</div>
        </div>
        <div class="mttr-card">
          <div class="mttr-label">${t('mttr.avgMttr')}</div>
          <div class="mttr-val" style="color:var(--amber)">${fmtMs(d.avgMttrMs)}</div>
          <div class="mttr-sub">${t('mttr.avgMttrSub')}</div>
        </div>
        <div class="mttr-card">
          <div class="mttr-label">${t('mttr.downtime')}</div>
          <div class="mttr-val">${fmtMs(d.totalDowntimeMs)}</div>
          <div class="mttr-sub">${t('mttr.downtimeSub')}</div>
        </div>
        <div class="mttr-card">
          <div class="mttr-label">${t('mttr.dataLoss')}</div>
          <div class="mttr-val" style="color:${d.dataLoss?'var(--red)':'var(--green)'}">${d.dataLoss||0}</div>
          <div class="mttr-sub">${t('mttr.dataLossSub')}</div>
        </div>`
    } else {
      ms.innerHTML = ''   // :empty → masqué via CSS (respecte la grille responsive)
    }
  }

  const el = document.getElementById('impact-strip'); if (!el) return
  if (!d.incidents) {
    el.innerHTML = `<div style="font-size:11px;font-family:var(--mono);color:var(--text3);padding:4px 0">${t('impact.none')}</div>`
    return
  }
  const rec = d.recurring?.length
    ? `<div style="margin-top:10px;font-size:11px;color:var(--text2)">${t('impact.recurring')} : ${d.recurring.map(r=>`<b style="color:var(--text)">${esc(r.name)}</b> ×${r.n}`).join(' · ')}</div>`
    : ''
  // Vue responsable : une phrase lisible sans connaître les crons (semaine, part des pannes documentées par l'équipe).
  const pct = Math.round(100 * (d.documented || 0) / d.incidents)
  const mgr = `<div class="impact-mgr" style="margin-top:8px;font-size:11px;color:var(--text2)">${t('impact.week')} : <b style="color:var(--text)">${d.week ?? 0}</b> · ${t('impact.documented')} : <b style="color:var(--text)">${pct} %</b> (${d.documented || 0}/${d.incidents})</div>`
  el.innerHTML = `
    <div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">${t('impact.header')}</div>
    <div class="stats impact-stats" style="margin:0">
      <div class="stat stat-fail"><div class="stat-label">${t('impact.incidents')}</div><div class="stat-val">${d.incidents}</div><div class="stat-sub">${d.affectedMonitors} ${t('impact.affected')}</div></div>
      <div class="stat stat-ai"><div class="stat-label">${t('impact.mttr')}</div><div class="stat-val" style="font-size:22px">${fmtMs(d.avgMttrMs)}</div><div class="stat-sub">${t('impact.mttrSub')}</div></div>
      <div class="stat stat-late"><div class="stat-label">${t('impact.downtime')}</div><div class="stat-val" style="font-size:22px">${fmtMs(d.totalDowntimeMs)}</div><div class="stat-sub">${t('impact.downtimeSub')}</div></div>
      <div class="stat ${d.dataLoss?'stat-fail':'stat-ok'}"><div class="stat-label">${t('impact.dataLoss')}</div><div class="stat-val">${d.dataLoss}</div><div class="stat-sub">${t('impact.dataLossSub')}</div></div>
    </div>${mgr}${rec}`
}

async function loadClientInfo() {
  try {
    const c = await api('/clients/me')
    document.getElementById('sidebar-email').textContent = c.email || '—'
    document.getElementById('sidebar-plan').textContent  = c.plan || 'free'
    document.getElementById('sidebar-plan').style.color  = c.plan === 'pro' ? 'var(--amber)' : 'var(--green)'
  } catch(e) { console.error(e) }
}

// ─── Renders ──────────────────────────────────────────────────────────────────
function renderMonitors(target) {
  const listId = target === 'full' ? 'monitors-list-full' : 'monitors-list'
  const el     = document.getElementById(listId)
  const q      = searchText.toLowerCase()
  const list   = monitors
    .filter(m => !q || m.name.toLowerCase().includes(q) || m.env.toLowerCase().includes(q))
    .filter(m => currentFilter !== 'alerts' || (m.last_status !== 'ok' && m.last_status !== 'unknown'))

  if (!list.length) {
    if (q) { el.innerHTML = `<div class="empty">${t('empty.noResult')} "${esc(q)}"</div>`; return }
    if (currentFilter === 'alerts') { el.innerHTML = `<div class="empty" style="color:var(--green)">${t('empty.alerts')}</div>`; return }
    el.innerHTML = `<div style="padding:32px 24px;text-align:center">
      <div style="font-size:32px;margin-bottom:16px;opacity:.35;color:var(--text3)">⬡</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">${t('empty.mon.title')}</div>
      <div style="font-size:12px;color:var(--text2);max-width:320px;margin:0 auto 20px;line-height:1.7">
        ${t('empty.mon.desc')}
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" data-click="openModal">${t('empty.mon.createFirst')}</button>
        <button class="btn btn-ghost" data-click="setView" data-args='["docs"]'>${t('empty.mon.seeDocs')}</button>
      </div>
      <div style="margin-top:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:480px;margin-left:auto;margin-right:auto">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;font-size:10px;color:var(--text3);font-family:var(--mono)">
          <div style="color:var(--green);font-weight:600;margin-bottom:4px">${t('empty.mon.s1t')}</div>${t('empty.mon.s1d')}
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;font-size:10px;color:var(--text3);font-family:var(--mono)">
          <div style="color:var(--blue);font-weight:600;margin-bottom:4px">${t('empty.mon.s2t')}</div>${t('empty.mon.s2d')}
        </div>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;font-size:10px;color:var(--text3);font-family:var(--mono)">
          <div style="color:var(--purple);font-weight:600;margin-bottom:4px">${t('empty.mon.s3t')}</div>${t('empty.mon.s3d')}
        </div>
      </div>
    </div>`
    return
  }

  el.innerHTML = list.map(m => {
    const st      = m.last_status || 'unknown'
    const isPaused = m.paused_until && new Date(m.paused_until) > new Date()
    const dotCls  = isPaused ? 'd-pause' : {ok:'d-ok',late:'d-late',failed:'d-fail'}[st] || 'd-unk'
    const pillCls = isPaused ? 'pill-pause' : {ok:'pill-ok',late:'pill-late',failed:'pill-fail'}[st] || 'pill-unk'
    const pillTxt = isPaused ? t('pill.pause') : {ok:t('pill.ok'),late:t('pill.late'),failed:t('pill.failed')}[st] || t('pill.unknown')
    const pings   = m.recent_pings || []
    const durs    = pings.filter(p => p.duration_ms > 0).map(p => p.duration_ms)
    const maxDur  = Math.max(...durs, 1)
    const spark   = pings.slice(0,25).map(p => {
      const s = p.status
      const cls = s==='success'?'sp-ok':s==='failed'||s==='fail'?'sp-fail':s==='late'?'sp-late':'sp-unk'
      const h = p.duration_ms > 0 ? Math.max(3, Math.round(p.duration_ms/maxDur*18)) : 4
      return `<div class="sp ${cls}" style="height:${h}px" title="${s} ${p.duration_ms||0}ms · ${fmtTime(p.pinged_at)}"></div>`
    }).join('')
    const lastDur = pings[0]?.duration_ms
    const avgDur  = m.avg_duration_7d
    const durTxt  = lastDur ? (lastDur>60000 ? Math.round(lastDur/1000)+'s' : lastDur+'ms') : '—'
    const durAnom = lastDur && avgDur && lastDur > avgDur*2.5
    const envCls  = {production:'env-p',staging:'env-s',development:'env-d'}[m.env]||'env-d'
    const isActive = activeMonitor?.id === m.id ? ' active-row' : ''
    const lastPing = m.last_ping_at ? ago(m.last_ping_at) : t('never')
    // Health score
    const score   = healthScore(m)
    const hColor  = healthColor(score)
    // Pending analysis indicator
    const isPending = pendingAnalysis.has(m.id)
    const pendingHtml = isPending ? `<span class="pending-spin" title="${t('pending')}"></span>` : ''
    const rowLabel = `${esc(m.name)}, ${esc(m.env)}, ${pillTxt}`
    return `<div class="m-row${isActive}" role="button" tabindex="0" aria-label="${rowLabel}"
      data-click="openDrawer" data-args="${esc(JSON.stringify([`${m.id}`]))}" data-key-click>
      <div class="m-dot ${dotCls}" aria-hidden="true"></div>
      <div>
        <div class="m-name">${esc(m.name)} ${pendingHtml}</div>
        <div class="m-env ${envCls}">${esc(m.env)} · ${lastPing}</div>
      </div>
      <div class="m-spark" aria-hidden="true">${spark||'<div style="color:var(--text3);font-size:9px">—</div>'}</div>
      <div class="m-dur ${durAnom?'m-dur-anom':''}">
        ${durTxt}
        <div class="health-ring" style="margin-top:2px" title="health ${score}/100">
          <div class="health-bar"><div class="health-fill" style="width:${score}%;background:${hColor}"></div></div>
          <span style="color:${hColor}">${score}</span>
        </div>
      </div>
      <div class="m-status"><span class="pill ${pillCls}">${pillTxt}</span></div>
      <div class="m-actions" role="group" aria-label="${esc(m.name)} actions">
        <button class="act-btn" data-click="openEditModal" data-args="${esc(JSON.stringify([m]))}" aria-label="${t('row.edit')}" title="${t('row.edit')}">edit</button>
        <button class="act-btn" data-click="ackMonitor" data-args="${esc(JSON.stringify([`${m.id}`]))}" aria-label="${t('row.ack')}" title="${t('row.ack')}">ack</button>
        <button class="act-btn" data-click="snoozeMonitor" data-args="${esc(JSON.stringify([`${m.id}`]))}" aria-label="${t('row.snooze')}" title="${t('row.snooze')}">snooze</button>
        <button class="act-btn" data-click="copyText" data-args="${esc(JSON.stringify([`${m.ping_key}`, `${t('dr.pingKeyCopied')}`]))}" aria-label="${t('row.copyKey')}" title="${t('row.copyKey')}">key</button>
        <button class="act-btn red" data-name="${esc(m.name)}" data-click="confirmDelete" data-args="${esc(JSON.stringify([`${m.id}`, m.name]))}" aria-label="${t('row.delete')}" title="${t('row.delete')}">del</button>
      </div>
    </div>`
  }).join('')
}

function renderLogs(target) {
  if (target === 'full') return renderJournal()
  // Panneau latéral du dashboard : version compacte
  const el = document.getElementById('log-body')
  if (!el) return
  if (!logsData.length) { el.innerHTML = `<div class="empty">${t('empty.activity')}</div>`; return }
  el.innerHTML = logsData.slice(0, 40).map(l => {
    const fail = l.status==='fail'||l.status==='failed'
    const isAI = !!l.diagnosis
    const lvl  = isAI ? 'AI' : fail ? 'ERR' : 'OK'
    const lCls = isAI ? 'lv-ai' : fail ? 'lv-err' : 'lv-ok'
    const t    = l.pinged_at ? fmtTime(l.pinged_at) : '—'
    const ai   = isAI ? '<span class="ai-pill">AI</span>' : ''
    const dur  = l.duration_ms ? ` ${fmtDur(l.duration_ms)}` : ''
    const rec  = l.records!=null ? ` · ${l.records}r` : ''
    const sub  = (dur||rec) ? `<div class="le-sub">${dur}${rec}</div>` : ''
    return `<div class="le"><span class="le-time">${t}</span><span class="le-level ${lCls}">${lvl}</span><div class="le-msg">${esc(l.monitor_name)}${ai}${sub}</div></div>`
  }).join('')
}

// ─── Journal (vue complète, filtrable, cliquable) ────────────────────────────
function renderJournal() {
  const el = document.getElementById('log-body-full')
  if (!el) return
  const q = logSearch.toLowerCase()
  const list = logsData.filter(l => {
    const fail = l.status==='fail'||l.status==='failed'||l.status==='late'
    if (logFilter === 'fail' && !fail)       return false
    if (logFilter === 'ai'   && !l.diagnosis) return false
    if (q && !(l.monitor_name||'').toLowerCase().includes(q)) return false
    return true
  })
  const cnt = document.getElementById('log-count')
  if (cnt) cnt.textContent = `${list.length}${list.length !== logsData.length ? '/'+logsData.length : ''}`
  if (!list.length) { el.innerHTML = `<div class="empty">${t('empty.activity')}</div>`; return }
  el.innerHTML = list.map(l => {
    const isFail = l.status==='fail'||l.status==='failed'
    const isLate = l.status==='late'
    const isAI   = !!l.diagnosis
    const sCls   = isFail ? 'je-s-fail' : isLate ? 'je-s-late' : 'je-s-ok'
    const sTxt   = isFail ? t('pill.failed') : isLate ? t('pill.late') : t('pill.ok')
    const ts     = l.pinged_at ? fmtTime(l.pinged_at) : '—'
    const meta   = []
    if (l.duration_ms)    meta.push(`<b>${fmtDur(l.duration_ms)}</b>`)
    if (l.records != null) meta.push(`<b>${l.records}</b> rec`)
    if (l.exit_code != null) meta.push(`exit <b>${l.exit_code}</b>`)
    const ai    = isAI ? '<span class="je-ai">IA</span>' : ''
    const rCls  = isFail ? 'je-r-fail' : isLate ? 'je-r-late' : 'je-r-ok'
    const click = l.monitor_id
      ? `role="button" tabindex="0" aria-label="${esc(l.monitor_name)} ${sTxt}" data-click="openDrawer" data-args="${esc(JSON.stringify([`${l.monitor_id}`]))}" data-key-click`
      : ''
    return `<div class="je ${rCls}" ${click}>
      <span class="je-time">${ts}</span>
      <span class="je-status ${sCls}">${sTxt}</span>
      <span class="je-name"><span class="je-n">${esc(l.monitor_name)}</span>${l.env?`<span class="je-env">${esc(l.env)}</span>`:''}</span>
      <span class="je-meta">${meta.join(' · ')} ${ai}</span>
    </div>`
  }).join('')
}

function setLogFilter(f) {
  logFilter = f
  ;['all','fail','ai'].forEach(s => {
    const b = document.getElementById('lf-'+s); if (b) b.classList.toggle('active', s===f)
  })
  renderJournal()
}
function filterLogs() {
  logSearch = document.getElementById('log-search').value
  renderJournal()
}

function anSeverity(a) { const d = typeof a.diagnosis==='string'?parse(a.diagnosis):a.diagnosis; return d?.severity || a.severity || 'medium' }
function anCategory(a) { const d = typeof a.diagnosis==='string'?parse(a.diagnosis):a.diagnosis; return d?.category || a.category || 'unknown' }
const SEV_RANK = { critical:0, high:1, medium:2, low:3 }

function filterAnalyses() {
  anSevFilter = document.getElementById('an-sev').value
  anCatFilter = document.getElementById('an-cat').value
  anSearch    = document.getElementById('an-search').value
  renderAnalyses()
}

function renderAnalyses() {
  const el = document.getElementById('analyses-list')
  renderAnSummary(analysesData)                       // bandeau sur le jeu complet
  if (metricsVisible) renderQualityMetrics(analysesData)
  const activeModel = window._activeModel || analysesData.find(a => a.model_used !== 'none')?.model_used || 'knowledge'

  const q = anSearch.toLowerCase()
  let list = analysesData.filter(a => {
    if (anSevFilter !== 'all' && anSeverity(a) !== anSevFilter) return false
    if (anCatFilter !== 'all' && anCategory(a) !== anCatFilter) return false
    if (q) {
      const d = typeof a.diagnosis==='string'?parse(a.diagnosis):a.diagnosis
      const hay = ((d?.cause||'')+' '+(a.monitorName||a.monitor_name||'')).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  list = list.slice().sort((a,b) =>
    (SEV_RANK[anSeverity(a)] ?? 9) - (SEV_RANK[anSeverity(b)] ?? 9)
    || new Date(b.created_at) - new Date(a.created_at))

  document.getElementById('an-info').textContent =
    `${list.length}${list.length!==analysesData.length ? '/'+analysesData.length : ''} ${list.length!==1?t('an.info.diags'):t('an.info.diag')} · ${activeModel}`

  if (!analysesData.length) {
    el.innerHTML = `<div style="padding:24px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:16px;line-height:1.7">
        ${t('sample.intro')}
      </div>
      <div class="an-item acc-high" style="opacity:.75;pointer-events:none;margin-bottom:16px">
        <div class="an-header">
          <div class="an-job"><span class="an-cat cat-database">database</span> backup-postgres ✕</div>
          <div class="an-meta">
            <span class="an-confidence conf-high">high</span>
            <span class="sev-pill sev-high">high</span>
            <span class="an-time">${t('sample.time')} · llama3.2:3b</span>
          </div>
        </div>
        <div class="an-meta-row"><span class="data-impact impact-confirmed">${t('sample.impact')}</span><span class="fix-time">${t('sample.fix')} <span>~15 min</span></span></div>
        <div class="an-cause">🔍 ${t('sample.cause')}</div>
        <div class="an-action">→ ${t('an.lead')} ${t('sample.action')}</div>
        <div class="an-prevention">🛡 ${t('sample.prevention')}</div>
        <div style="margin-top:8px">
          <div class="an-checks-label">${t('sample.checks')}</div>
          <div class="an-check-item">${t('sample.check1')}</div>
          <div class="an-check-item">${t('sample.check2')}</div>
        </div>
      </div>
      <div style="text-align:center">
        <button class="btn btn-primary" data-click="setView" data-args='["playground"]'>${t('sample.cta')}</button>
      </div>
    </div>`
    return
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty">${t('an.none')}<br>
      <button class="btn btn-ghost" data-click="resetAnFilters" style="margin-top:12px">↺ ${t('an.reset')}</button></div>`
    return
  }

  el.innerHTML = list.map((a, i) => {
    const d          = typeof a.diagnosis==='string' ? parse(a.diagnosis) : a.diagnosis
    const cause      = d?.cause      || a.diagnosis || '—'
    const action     = d?.action     || null
    const prevention = d?.prevention || a.prevention || null
    const category   = d?.category   || a.category   || 'unknown'
    const confidence = a.confidence  || 'medium'
    const sev        = d?.severity   || a.severity   || 'medium'
    const impact     = a.data_impact || 'none'
    const fixMins    = a.fix_minutes || null
    const ts         = a.created_at  ? fmtTime(a.created_at) : '—'
    const cache      = a.from_cache  ? '<span class="ai-pill">cache</span>' : ''
    const type       = a.alert_type==='timeout' ? '⏱' : a.alert_type==='slow' ? '🐢' : '✕'

    // Parse checks
    const checks = (() => {
      const raw = a.checks || d?.checks
      if (!raw) return []
      if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
      return Array.isArray(raw) ? raw : []
    })()

    // Parse correlated monitors
    const correlated = (() => {
      const raw = a.correlated_monitors
      if (!raw) return []
      if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
      return Array.isArray(raw) ? raw : []
    })()

    const hasLog = a.ping_output || a.ping_exit_code != null
    const logTxt = (a.ping_exit_code != null ? 'exit: ' + a.ping_exit_code + '\n' : '') + (a.ping_output || '')

    const impactLabel = {none: t('di.none'), possible: t('di.possible'), confirmed: t('di.confirmed')}

    const correlatedHtml = correlated.length
      ? `<div class="an-correlated">🔗 ${t('an.correlated')} ${esc(correlated.join(', '))} ${t('an.commonCause')}</div>`
      : ''
    const checksHtml = checks.length
      ? `<div class="an-checks">
           <div class="an-checks-label">${t('pg.res.checks')}</div>
           ${checks.map(c => `<div class="an-check-item">${esc(String(c))}</div>`).join('')}
         </div>` : ''
    const logsHtml = hasLog
      ? `<div class="an-logs-toggle" data-click="toggleLog" data-args="${esc(JSON.stringify([`al${i}`]))}" data-pass="el">▶ ${t('log.show')} (${logTxt.trim().length}c)</div>
         <div class="an-logs-content" id="al${i}">${esc(logTxt.trim())}</div>` : ''

    return `<div class="an-item acc-${esc(sev)}" id="an-${a.id||i}">
      <div class="an-header">
        <div class="an-job">
          <span class="an-cat cat-${esc(category)}">${esc(category)}</span>
          ${esc(a.monitorName||'?')} ${type} ${cache}
        </div>
        <div class="an-meta">
          <span class="an-confidence conf-${esc(confidence)}">${esc(confidence)}</span>
          <span class="sev-pill sev-${esc(sev)}">${esc(sev)}</span>
          <span class="an-time">${ts} · ${esc(a.model_used||'llama3.2:3b')}</span>
        </div>
      </div>

      <div class="an-meta-row">
        <span class="data-impact impact-${esc(impact)}">${impactLabel[impact]||esc(impact)}</span>
        ${fixMins ? `<span class="fix-time">${t('an.fixEst')} <span>~${fixMins} min</span></span>` : ''}
      </div>

      ${correlatedHtml}
      <div class="an-cause">🔍 ${esc(cause)}</div>
      ${a.explanation ? `<div class="an-explain"><span class="an-checks-label">${t('an.explain')}</span> ${esc(a.explanation)}</div>` : ''}
      ${evidenceHtml(a.evidence)}
      ${changedHtml(a)}
      ${resolutionHtml(a)}
      ${knownFixHtml(a.known_fix, a.verified_fix)}
      ${a.verified_fix
        ? `<div class="an-action">✓ ${t('an.verified')} (${esc(String(a.fix_verified_at||'').slice(0,10))}) : ${esc(a.verified_fix)}</div>`
        : action ? `<div class="an-action">→ ${t('an.lead')} ${esc(action)}</div>` : ''}
      ${prevention && prevention !== action
        ? `<div class="an-prevention">🛡 ${esc(prevention)}</div>` : ''}
      ${checksHtml}
      ${logsHtml}

      <div class="feedback-row">
        <span class="fb-label">${t('fb.question')}</span>
        <button class="fb-btn ${a.user_feedback==='positive'?'active-pos':''}"
          data-click="sendFeedback" data-args="${esc(JSON.stringify([`${a.id||''}`, "positive", `an-${a.id||i}`]))}">👍</button>
        <button class="fb-btn ${a.user_feedback==='negative'?'active-neg':''}"
          data-click="sendFeedback" data-args="${esc(JSON.stringify([`${a.id||''}`, "negative", `an-${a.id||i}`]))}">👎</button>
        <button class="fb-btn" data-click="recordFix" data-args="${esc(JSON.stringify([`${a.id||''}`]))}">${t('fb.fixBtn')}</button>
        <button class="fb-btn" title="${esc(t('rep.mailTip'))}" data-click="mailReport" data-args="${esc(JSON.stringify([`${a.id||''}`]))}">✉ ${t('rep.mail')}</button>
        <button class="fb-btn" data-click="copyReport" data-args="${esc(JSON.stringify([`${a.id||''}`]))}">⧉ ${t('rep.copy')}</button>
      </div>
    </div>`
  }).join('')
}

// ─── Drawer (détail monitor) ──────────────────────────────────────────────────
async function openDrawer(id) {
  const m = monitors.find(x => x.id===id)
  if (!m) return
  activeMonitor = m
  anLocked = true
  anMonitor = m
  // Badge "analyses filtrées sur ce monitor" dans l'onglet Analyses IA
  const fb = document.getElementById('an-filter-badge')
  const fn = document.getElementById('an-filter-name')
  if (fb && fn) { fn.textContent = m.name; fb.style.display = '' }
  renderMonitors('dash'); renderMonitors('full')

  const isPaused = m.paused_until && new Date(m.paused_until) > new Date()
  const st = m.last_status || 'unknown'
  const dotCls = {ok:'d-ok',late:'d-late',failed:'d-fail'}[st] || 'd-unk'

  document.getElementById('d-name').innerHTML = `<div class="m-dot ${dotCls}"></div> ${esc(m.name)}`
  document.getElementById('d-meta').innerHTML = `
    <span class="env-p">${esc(m.env)}</span>
    <span>${t('dr.grace')}: ${m.grace_period}s</span>
    ${m.schedule ? `<span>⟳ ${esc(m.schedule)}</span>` : ''}
    ${m.expected_min!=null ? `<span>${m.expected_min}–${m.expected_max||'∞'} ${t('dr.records')}</span>` : ''}`

  document.getElementById('d-actions').innerHTML = `
    <button class="d-btn" data-click="openEditModal" data-args="${esc(JSON.stringify([m]))}">✎ ${t('dr.edit')}</button>
    <button class="d-btn" data-click="copyText" data-args="${esc(JSON.stringify([`${m.ping_key}`, `${t('dr.pingKeyCopied')}`]))}">⎘ ${t('dr.pingKey')}</button>
    <button class="d-btn" data-click="testMonitor" data-args="${esc(JSON.stringify([`${id}`]))}">⚡ ${t('dr.testAlert')}</button>
    <button class="d-btn" data-click="ackMonitor" data-args="${esc(JSON.stringify([`${id}`]))}">✓ ${t('dr.ack')}</button>
    <button class="d-btn" data-click="snoozeMonitor" data-args="${esc(JSON.stringify([`${id}`]))}">⏸ ${t('dr.snooze')}</button>
    ${isPaused ? `<button class="d-btn success" data-click="resumeMonitor" data-args="${esc(JSON.stringify([`${id}`]))}">▶ ${t('dr.resume')}</button>`
               : `<button class="d-btn" data-click="pauseMonitor" data-args="${esc(JSON.stringify([`${id}`]))}">⏹ ${t('dr.pause')}</button>`}
    <button class="d-btn danger" data-name="${esc(m.name)}" data-click="confirmDelete" data-args="${esc(JSON.stringify([`${id}`, m.name]))}">✕ ${t('dr.delete')}</button>`

  document.getElementById('d-body').innerHTML = '<div class="empty">…</div>'
  document.getElementById('drawer-overlay').classList.add('open')
  document.getElementById('drawer').classList.add('open')

  // Charge l'historique en parallèle
  try {
    const [history, analyses] = await Promise.all([
      api(`/monitors/${id}/history?limit=50`),
      api(`/monitors/${id}/analyses`)
    ])
    const mon = monitors.find(m => m.id === id)
    analyses.forEach(a => {
      a.monitorName = mon?.name || '?'
      const ping = history.find(h => h.analysed_at === a.created_at)
      a.ping_output   = ping?.output   || null
      a.ping_exit_code = ping?.exit_code ?? null
    })
    renderDrawerBody(m, history, analyses)
    // Met aussi à jour la vue analyses (verrouillée sur ce monitor)
    analysesData = analyses
    renderAnalyses()
  } catch(e) {
    document.getElementById('d-body').innerHTML = `<div class="empty">erreur: ${esc(e.message)}</div>`
  }
}

function renderDrawerBody(m, history, analyses) {
  const ok    = history.filter(h => h.status==='success').length
  const total = history.length
  const uptimePct = total > 0 ? Math.round(ok/total*100) : 100
  const durs  = history.filter(h => h.duration_ms>0).map(h => h.duration_ms)
  const avg   = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0
  const p95   = durs.length ? [...durs].sort((a,b)=>a-b)[Math.floor(durs.length*.95)] : 0

  // Sparkline grande taille
  const maxD = Math.max(...durs, 1)
  const bigSpark = history.slice(0,50).map(h => {
    const s = h.status
    const cls = s==='success'?'sp-ok':s==='failed'||s==='fail'?'sp-fail':'sp-late'
    const ht = h.duration_ms>0 ? Math.max(4, Math.round(h.duration_ms/maxD*28)) : 6
    return `<div class="ds ${cls}" style="height:${ht}px" title="${s} ${h.duration_ms||0}ms · ${ago(h.pinged_at)}"></div>`
  }).join('')

  const histRows = history.slice(0,30).map(h => {
    const s = h.status
    const sc = s==='success'?'hs-ok':s==='failed'||s==='fail'?'hs-fail':'hs-late'
    const dur = h.duration_ms ? (h.duration_ms>60000?Math.round(h.duration_ms/1000)+'s':h.duration_ms+'ms') : '—'
    const rec = h.records!=null ? h.records+'r' : ''
    const ai  = h.diagnosis ? '<span class="hist-ai">'+esc((parse(h.diagnosis)||{}).cause||'').slice(0,30)+'</span>' : ''
    return `<div class="hist-row">
      <span class="hist-time">${ago(h.pinged_at)}</span>
      <span class="hist-status ${sc}">${s==='success'?'ok':s}</span>
      <span class="hist-dur">${dur}</span>
      <span class="hist-rec">${rec}</span>
      ${ai}
    </div>`
  }).join('')

  const recentAnalyses = analyses.slice(0,5).map((a,i) => {
    const d          = typeof a.diagnosis==='string' ? parse(a.diagnosis) : a.diagnosis
    const cause      = d?.cause      || '—'
    const action     = d?.action     || null
    const prevention = d?.prevention || a.prevention || null
    const sev        = d?.severity   || a.severity || 'medium'
    const category   = d?.category   || a.category || 'unknown'
    const fixMins    = a.fix_minutes || d?.fix_minutes || null
    const impact     = a.data_impact || d?.data_impact || 'none'
    const dChecks = (() => {
      const raw = a.checks || d?.checks
      if (!raw) return []
      if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
      return Array.isArray(raw) ? raw : []
    })()
    const hasLog = a.ping_output || a.ping_exit_code!=null
    const logTxt = (a.ping_exit_code!=null?'exit: '+a.ping_exit_code+'\n':'')+(a.ping_output||'')
    const logs   = hasLog ? `<div class="d-analysis-logs" data-click="toggleLog" data-args="${esc(JSON.stringify([`dl${i}`]))}" data-pass="el">▶ ${t('log.show')}</div>
      <div class="d-logs-content" id="dl${i}">${esc(logTxt.trim())}</div>` : ''
    const checksHtml = dChecks.length
      ? dChecks.map(c => `<div style="font-size:10px;color:var(--text2);padding:1px 0;font-family:var(--mono)">→ ${esc(String(c))}</div>`).join('')
      : ''
    return `<div class="d-analysis">
      <div class="d-analysis-job">
        <span><span class="an-cat cat-${esc(category)}" style="font-size:8px">${esc(category)}</span> ${a.alert_type==='timeout'?'⏱':a.alert_type==='slow'?'🐢':'✕'} ${esc(a.monitorName||'?')}</span>
        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
          ${impact !== 'none' ? `<span class="data-impact impact-${impact}" style="font-size:8px">${impact === 'confirmed' ? '⚠ '+t('dr.dataShort') : '? '+t('dr.dataShort')}</span>` : ''}
          ${fixMins ? `<span style="font-size:8px;font-family:var(--mono);color:var(--text3)">~${fixMins}m</span>` : ''}
          <span class="sev-pill sev-${esc(sev)}">${esc(sev)}</span>
        </div>
      </div>
      <div class="d-analysis-cause">🔍 ${esc(cause)}</div>
      ${evidenceHtml(a.evidence)}
      ${changedHtml(a)}
      ${resolutionHtml(a)}
      ${knownFixHtml(a.known_fix, a.verified_fix)}
      ${action    ? `<div class="d-analysis-action">→ ${t('an.lead')} ${esc(action)}</div>` : ''}
      ${prevention && prevention !== action ? `<div style="font-size:10px;color:var(--text3);padding:4px 6px;background:var(--bg2);border-radius:3px;border-left:2px solid var(--blue);margin-bottom:4px">🛡 ${esc(prevention)}</div>` : ''}
      ${checksHtml}
      ${logs}
    </div>`
  }).join('')

  const trend7d = calcTrend(history)
  const trendHtml = trend7d !== null
    ? `<span class="trend ${Math.abs(trend7d)<10?'trend-flat':trend7d>0?'trend-up':'trend-down'}">
        ${trend7d>0?'↑':'↓'} ${Math.abs(trend7d)}% / 7j
       </span>`
    : ''

  document.getElementById('d-body').innerHTML = `
    <div class="d-section">
      <div class="d-stats-row">
        <div class="d-stat"><div class="d-stat-label">${t('dr.uptime')}</div><div class="d-stat-val" style="color:var(--${uptimePct>95?'green':uptimePct>80?'amber':'red'})">${uptimePct}%</div></div>
        <div class="d-stat"><div class="d-stat-label">${t('dr.avgDur')}</div><div class="d-stat-val">${avg>60000?Math.round(avg/1000)+'s':avg+'ms'} ${trendHtml}</div></div>
        <div class="d-stat"><div class="d-stat-label">${t('dr.p95')}</div><div class="d-stat-val">${p95>60000?Math.round(p95/1000)+'s':p95+'ms'}</div></div>
      </div>
      <div class="d-spark">${bigSpark}</div>
    </div>

    <div class="d-section">
      <div class="d-section-title">ping_key <button class="key-copy" data-click="copyText" data-args="${esc(JSON.stringify([`${m.ping_key}`, `${t('dr.pingKeyCopied')}`]))}">${t('dr.copy')}</button></div>
      <div class="key-box"><span style="word-break:break-all">${m.ping_key}</span></div>
      <div class="curl-box">curl -sX POST ${BASE_URL}/ping/${m.ping_key} \\
  -d '{"status":"success","duration_ms":1200}'

# ou en bash
./mon-script.sh && curl -sX POST \\
  ${BASE_URL}/ping/${m.ping_key} \\
  -d "{\"status\":\"success\",\"exit_code\":$?,\"records\":$COUNT}"</div>
      <div style="margin-top:8px;font-size:10px;font-family:var(--mono);color:var(--text3)">
        ${t('dr.statusPage')}
        <a href="${BASE_URL}/status/${m.id}" target="_blank"
           style="color:var(--green);text-decoration:none"
           title="${t('dr.statusOpen')}">
          ${BASE_URL}/status/${m.id}
        </a>
      </div>
    </div>

    ${recentAnalyses ? `<div class="d-section">
      <div class="d-section-title">${t('dr.recentAnalyses')}</div>
      ${recentAnalyses}
    </div>` : ''}

    <div class="d-section">
      <div class="d-section-title">${t('dr.history')} (${history.length})</div>
      ${histRows || `<div class="empty">${t('dr.noPing')}</div>`}
    </div>`
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open')
  document.getElementById('drawer').classList.remove('open')
  activeMonitor = null
  anLocked      = false
  renderMonitors('dash'); renderMonitors('full')
}

// ─── Monitor actions ──────────────────────────────────────────────────────────
async function ackMonitor(id) {
  try { await api(`/monitors/${id}/acknowledge`, {method:'POST'}); toast(t('toast.acked'),'ok'); await loadMonitors() }
  catch(e) { toast(e.message,'err') }
}

async function snoozeMonitor(id) {
  try { await api(`/monitors/${id}/snooze`, {method:'POST',body:JSON.stringify({minutes:60})}); toast(t('toast.snoozed'),'ok'); await loadMonitors() }
  catch(e) { toast(e.message,'err') }
}

async function pauseMonitor(id) {
  try { await api(`/monitors/${id}/pause`, {method:'POST',body:JSON.stringify({minutes:120})}); toast(t('toast.paused'),'ok'); await loadMonitors(); if(activeMonitor?.id===id) openDrawer(id) }
  catch(e) { toast(e.message,'err') }
}

async function resumeMonitor(id) {
  try { await api(`/monitors/${id}/resume`, {method:'POST'}); toast(t('toast.resumed'),'ok'); await loadMonitors(); if(activeMonitor?.id===id) openDrawer(id) }
  catch(e) { toast(e.message,'err') }
}

async function testMonitor(id) {
  try { await api(`/monitors/${id}/test`, {method:'POST'}); toast(t('toast.testSent'),'ok') }
  catch(e) { toast(e.message,'err') }
}

function confirmDelete(id, name) {
  // Crée un modal de confirmation qui exige de taper le nom
  const existing = document.getElementById('del-confirm')
  if (existing) existing.remove()
  const div = document.createElement('div')
  div.id = 'del-confirm'
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:flex;align-items:center;justify-content:center'
  div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--red-dim);border-radius:var(--radius-lg);padding:24px;width:360px">
    <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">${t('del.title')} "${esc(name)}"</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:12px">${t('del.warn')}</div>
    <input id="del-name-input" class="del-input" placeholder="${esc(name)}" data-name="${esc(name)}" data-input="checkDelName" data-args="${esc(JSON.stringify([name, 'del-ok-btn']))}">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost" data-click="closeDelConfirm">${t('del.cancel')}</button>
      <button id="del-ok-btn" class="btn" style="background:var(--red-dim);color:var(--red);border:1px solid var(--red-dim);opacity:.4;pointer-events:none" data-click="doDelete" data-args="${esc(JSON.stringify([`${id}`]))}">${t('del.confirm')}</button>
    </div>
  </div>`
  document.body.appendChild(div)
}

function checkDelName(expected, btnId) {
  const val = document.getElementById('del-name-input').value
  const btn = document.getElementById(btnId)
  const ok  = val === expected
  btn.style.opacity = ok ? '1' : '.4'
  btn.style.pointerEvents = ok ? 'auto' : 'none'
}

async function doDelete(id) {
  const div = document.getElementById('del-confirm')
  if (div) div.remove()
  try {
    await api(`/monitors/${id}`, {method:'DELETE'})
    toast(t('toast.deleted'),'ok')
    if (activeMonitor?.id===id) closeDrawer()
    await loadMonitors()
  } catch(e) { toast(e.message,'err') }
}

// ─── Modal nouveau monitor ────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-form').style.display = ''
  document.getElementById('modal-success').style.display = 'none'
  document.getElementById('modal-import').style.display = 'none'
  document.getElementById('m-err').textContent = ''
  ;['m-name','m-schedule','m-emin','m-emax'].forEach(id => document.getElementById(id).value='')
  document.getElementById('modal-bg').classList.remove('hidden')
  setTimeout(() => document.getElementById('m-name').focus(), 50)
}

function closeModal() {
  document.getElementById('modal-bg').classList.add('hidden')
  loadMonitors()
}

// ─── Import d'une crontab collée (même règles que sdk/bash/cronguard-import.sh) ───────────────────────────────
// Planning écrit par le serveur (scheduleText), nom + rôle proposés par l'IA locale si déclarée, sinon le nom
// de la commande. Les noms restent modifiables ; rien n'est créé avant « créer les monitors ».
let importJobs = []
function openImport() {
  openModal()
  document.getElementById('modal-form').style.display = 'none'
  document.getElementById('modal-import').style.display = ''
  document.getElementById('imp-text').value = DEMO ? DEMO_CRONTAB : ''
  ;['imp-rows', 'imp-status'].forEach(id => document.getElementById(id).textContent = '')
  ;['imp-out', 'imp-copy', 'imp-create'].forEach(id => document.getElementById(id).style.display = 'none')
  document.getElementById('imp-analyze').style.display = ''
  importJobs = []
  setTimeout(() => document.getElementById('imp-text').focus(), 50)
}

// Nom de secours = premier exécutable significatif, sans extension (job_name() du script d'import).
function codeJobName(cmd) {
  const words = cmd.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === 'cd') { i++; continue }
    if (/=/.test(w) || /^-/.test(w) || /^(&&|\|\||;|\||sudo|nice|ionice|flock|timeout|env|bash|sh|node|php|\/usr\/bin\/env)$/.test(w) || /^(>|<|2>)/.test(w) || /^python/.test(w)) continue
    return (w.split('/').pop().replace(/\.[^.]*$/, '') || 'job').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 60)
  }
  return 'job'
}

function parseCrontab(text, system) {
  const jobs = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(line) || line.startsWith('@reboot') || line.includes('cg_run')) continue
    const m = line.match(/^(@\w+)\s+(.*)$/) || line.match(/^((?:\S+\s+){4}\S+)\s+(.*)$/)
    if (!m) continue
    let schedule = m[1].replace(/\s+/g, ' '), cmd = m[2], user = ''
    if (system) { user = cmd.split(/\s+/)[0]; cmd = cmd.slice(user.length).trim() }
    if (cmd) jobs.push({ schedule, cmd, user })
  }
  return jobs.slice(0, 100)
}

async function analyzeImport() {
  const jobs = parseCrontab(document.getElementById('imp-text').value, document.getElementById('imp-system').checked)
  const status = document.getElementById('imp-status')
  if (!jobs.length) { status.textContent = t('imp.none'); return }
  document.getElementById('imp-analyze').style.display = 'none'
  for (let i = 0; i < jobs.length; i++) {
    status.textContent = `${t('imp.progress')} ${i + 1}/${jobs.length}…`
    let s = {}
    try { s = await api('/monitors/suggest-name', { method: 'POST', body: JSON.stringify({ command: jobs[i].cmd, schedule: jobs[i].schedule, lang: LANG === 'fr' ? 'fr' : 'en' }) }) } catch { /* nom du code */ }
    Object.assign(jobs[i], { name: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.name || '') ? s.name : codeJobName(jobs[i].cmd), ai: !!s.name,
      role: s.role || '', when: s.when || jobs[i].schedule, critical: s.critical === true, expect: typeof s.expect === 'string' ? s.expect : '',
      risks: Array.isArray(s.risks) ? s.risks.filter(x => typeof x === 'string') : [] })
  }
  importJobs = jobs
  status.textContent = `${jobs.length} ${t('imp.found')} ${jobs.some(j => j.ai) ? t('imp.aiNote') : t('imp.codeNote')}`
  document.getElementById('imp-rows').innerHTML = jobs.map((j, i) => `<div class="imp-row">
    <label class="imp-keep"><input type="checkbox" checked id="imp-keep-${i}" aria-label="${esc(t('imp.keep'))}"></label>
    <div class="imp-main">
      <input class="field-input imp-name" id="imp-name-${i}" value="${esc(j.name)}" maxlength="60" aria-label="${esc(t('mod.new.name'))}">
      <div class="imp-meta">${j.role ? esc(j.role) + ' — ' : ''}${esc(j.when)}${j.critical ? ` <span class="imp-crit">⚑ ${t('imp.critical')}</span>` : ''}</div>
      ${j.expect ? `<div class="imp-meta">${esc(t('imp.expect'))} <code>${esc(j.expect)}</code></div>` : ''}
      ${j.risks.map(r => `<div class="imp-meta imp-risk">⚠ ${esc(r)}</div>`).join('')}
      <code class="imp-cmd">${esc(j.cmd.slice(0, 160))}</code>
    </div></div>`).join('')
  document.getElementById('imp-create').style.display = ''
}

async function createImport() {
  const out = [], seen = {}
  for (let i = 0; i < importJobs.length; i++) {
    if (!document.getElementById(`imp-keep-${i}`).checked) continue
    const j = importJobs[i]
    let name = document.getElementById(`imp-name-${i}`).value.trim() || codeJobName(j.cmd)
    seen[name] = (seen[name] || 0) + 1
    if (seen[name] > 1) name += '-' + seen[name]
    let m
    try { m = await api('/monitors', { method: 'POST', body: JSON.stringify({ name, schedule: j.schedule.startsWith('@') ? undefined : j.schedule }) }) }
    catch (e) { const why = e.message; toast(`${name} : ${why}`, 'err'); continue }   // toast = textContent
    if (!m || m.demo) return   // démo : lecture seule (toast déjà affiché)
    // La commande d'origine passe en $0, un seul niveau d'apostrophes : ' → '\''. Elle tourne sous le shell de cron
    // ($SHELL, /bin/sh par défaut), pas sous bash : sinon un job « sh » se comporte autrement (labo terrain 2, g40).
    // Sortie attendue proposée : « réussi mais n'a rien produit » devient une panne (CG_EXPECT du SDK).
    const exp = j.expect ? `CG_EXPECT='${j.expect.replace(/'/g, '')}' ` : ''
    out.push(`${j.schedule}${j.user ? ' ' + j.user : ''} ${exp}CRONGUARD_URL=${BASE_URL} bash -c 'source /usr/local/lib/cronguard.sh && cg_run ${m.ping_key} "\${SHELL:-/bin/sh}" -c "$0"' '${j.cmd.replace(/'/g, "'\\''")}'`)
  }
  if (!out.length) return
  const pre = document.getElementById('imp-out')
  // 1. le SDK sur la machine du job (servi par cette API), 2. les lignes à coller dans « crontab -e ».
  const local = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL) ? `# ${t('imp.localhost')}\n` : ''
  pre.textContent = `${local}# ${t('imp.step1')}\nsudo curl -fsSL ${BASE_URL}/sdk/cronguard.sh -o /usr/local/lib/cronguard.sh\n\n# ${t('imp.paste')}\n` + out.join('\n')
  pre.style.display = ''
  document.getElementById('imp-copy').style.display = ''
  document.getElementById('imp-create').style.display = 'none'
  document.getElementById('imp-status').textContent = `${out.length} ${t('imp.created')}`
}

function copyImport() { copyText(document.getElementById('imp-out').textContent, t('toast.copied')) }

async function createMonitor() {
  const name     = document.getElementById('m-name').value.trim()
  const env      = document.getElementById('m-env').value
  const grace    = parseInt(document.getElementById('m-grace').value)||300
  const schedule = document.getElementById('m-schedule').value.trim()||undefined
  const emin     = parseInt(document.getElementById('m-emin').value)||undefined
  const emax     = parseInt(document.getElementById('m-emax').value)||undefined
  if (!name) { document.getElementById('m-err').textContent='le nom est obligatoire'; return }
  try {
    const m = await api('/monitors', {method:'POST', body:JSON.stringify({name,env,grace_period:grace,schedule,expected_min:emin,expected_max:emax})})
    document.getElementById('modal-form').style.display = 'none'
    document.getElementById('modal-success').style.display = ''
    document.getElementById('s-key').textContent = m.ping_key
    document.getElementById('s-curl').textContent =
      `# succès\ncurl -sX POST ${BASE_URL}/ping/${m.ping_key} \\\n  -d '{"status":"success","duration_ms":$SECONDS}'\n\n# échec\ncurl -sX POST ${BASE_URL}/ping/${m.ping_key} \\\n  -d "{\"status\":\"fail\",\"exit_code\":$?,\"output\":\"$LOG\"}"`
  } catch(e) { document.getElementById('m-err').textContent = e.message }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setView(view) {
  currentView = view
  document.querySelectorAll('.s-item').forEach(n => n.classList.remove('active'))
  const nav = document.getElementById('nav-'+view); if (nav) nav.classList.add('active')
  const titleKey = {dashboard:'title.dashboard',monitors:'title.services',logs:'title.logs',analyses:'title.analyses',settings:'title.settings',docs:'title.docs',playground:'title.playground'}
  document.getElementById('page-title').textContent = t(titleKey[view] || 'title.'+view)
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  const vp = document.getElementById('view-'+view); if (vp) vp.classList.add('active')
  if (view==='logs')      loadLogs('full')
  if (view==='analyses')  { loadImpact(); loadAnalyses(anLocked?anMonitor?.id:null); initQuickErrors() }
  if (view==='playground'){ initQuickErrors(); const m = window._activeModel; if(m) { const p=document.getElementById('pg-model-pill'); if(p) p.textContent=m } }
  if (view==='monitors')  renderMonitors('full')
  if (view==='settings')  { loadSettings(); updateDocUrls(); setSettingsTab(settingsTab) }
  if (view==='docs')      updateDocUrls()
}

// ─── Sous-navigation Settings ─────────────────────────────────────────────────
let settingsTab = 'account'
// Réglages avancés (alertes, équipe, statut, apprentissage, audit) masqués tant qu'on ne les demande pas.
function showAdvancedSettings(on) {
  document.querySelector('.settings-tabs')?.classList.toggle('show-adv', on)
  try { on ? localStorage.setItem('cg_adv', '1') : localStorage.removeItem('cg_adv') } catch { /* stockage indisponible */ }
  const more = document.getElementById('stab-more'); if (more) more.textContent = t(on ? 'set.tab.less' : 'set.tab.more')
}
function toggleAdvancedSettings() {
  const on = !document.querySelector('.settings-tabs')?.classList.contains('show-adv')
  showAdvancedSettings(on)
  if (!on && !['account', 'notifications'].includes(settingsTab)) setSettingsTab('account')
}
function setSettingsTab(tab) {
  if (!['account', 'notifications'].includes(tab) && !document.querySelector('.settings-tabs')?.classList.contains('show-adv')) showAdvancedSettings(true)   // lien direct vers un onglet avancé
  settingsTab = tab
  document.querySelectorAll('[data-stab-btn]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-stab-btn') === tab))
  document.querySelectorAll('[data-stab]').forEach(s =>
    s.classList.toggle('stab-off', s.getAttribute('data-stab') !== tab))
  const c = document.querySelector('.content'); if (c) c.scrollTop = 0
  if (tab === 'audit') loadAudit()
  if (tab === 'learning') loadLearning()
}

// ─── Apprentissage : pannes non reconnues → fiches d'équipe (fin de la boucle) ──
let learnDraftFor = null   // analyse corrigée dont on fait la fiche
async function loadLearning() {
  const cand = document.getElementById('learn-candidates'), fixes = document.getElementById('learn-fixes'),
        unrec = document.getElementById('learn-unrecognized')
  if (!cand) return
  const empty = key => `<div style="font-size:12px;color:var(--text3)">${t(key)}</div>`
  try {
    const [learn, team] = await Promise.all([api('/clients/learning'), api('/clients/fixes')])
    // Ce que la boucle rapporte : pannes reconnues grâce à l'équipe contre pannes encore inconnues (30 j).
    const st = document.getElementById('learn-stats'), s = learn.stats
    if (st) st.textContent = s ? t('learn.stats').replace('{learned}', String(s.learned)).replace('{unknown}', String(s.unknown)) : ''
    cand.innerHTML = learn.candidates.length ? learn.candidates.map(c => `
      <div class="settings-row" style="align-items:flex-start">
        <div style="min-width:0">
          <div style="font-family:var(--mono);font-size:11px;color:var(--amber);word-break:break-word">${esc(c.signature.slice(0,140))}</div>
          <div style="font-size:11px;color:var(--green);margin-top:3px">✓ ${esc(c.verifiedFix||'')}</div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-top:2px">${c.occurrences}× · ${esc((c.jobs||[]).slice(0,3).join(', '))}</div>
        </div>
        ${c.analysisId ? `<button class="btn btn-primary" style="flex-shrink:0" data-click="openTeamFixDraft" data-args="${esc(JSON.stringify([c.analysisId]))}">${t('learn.make')}</button>` : ''}
      </div>`).join('') : empty('learn.noCandidates')
    fixes.innerHTML = team.length ? team.map(f => `
      <div class="settings-row" style="align-items:flex-start">
        <div style="min-width:0">
          <div class="settings-label">${esc(f.title)}</div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:2px">${t('learn.trigger')} « ${esc(f.match)} » · ${esc(f.created_by||'—')} · ${fmtDateTime(f.created_at)}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:3px">${esc(f.action)}</div>
        </div>
        <button class="btn btn-ghost" style="flex-shrink:0" data-click="disableTeamFix" data-args="${esc(JSON.stringify([f.id]))}">${t('learn.disable')}</button>
      </div>`).join('') : empty('learn.noFixes')
    unrec.innerHTML = learn.unrecognized.length ? learn.unrecognized.map(u => `
      <div class="settings-row"><div style="min-width:0">
        <div style="font-family:var(--mono);font-size:11px;color:var(--text2);word-break:break-word">${esc(u.signature.slice(0,140))}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-top:2px">${u.occurrences}× · ${esc((u.jobs||[]).slice(0,3).join(', '))}${u.verifiedFix ? '' : ' · ' + t('learn.waitFix')}</div>
      </div></div>`).join('') : empty('learn.noUnrecognized')
  } catch (e) {
    const denied = /^403/.test(e.message)
    cand.innerHTML = empty(denied ? 'audit.denied' : 'learn.error'); fixes.innerHTML = ''; unrec.innerHTML = ''
  }
}
async function openTeamFixDraft(analysisId) {
  try {
    const d = await api('/clients/fixes/draft/' + encodeURIComponent(analysisId))
    learnDraftFor = analysisId
    document.getElementById('lf-match').value = d.match || ''
    document.getElementById('lf-title').value = d.title || ''
    document.getElementById('lf-cause').value = d.cause || ''
    document.getElementById('lf-action').value = d.action || ''
    document.getElementById('lf-category').value = d.category || 'unknown'
    document.getElementById('learn-form').style.display = 'block'
    document.getElementById('lf-match').focus()
  } catch { toast(t('learn.error'), 'error') }
}
function closeTeamFixForm() { learnDraftFor = null; document.getElementById('learn-form').style.display = 'none' }
async function saveTeamFix() {
  if (!learnDraftFor) return
  const body = { analysisId: learnDraftFor,
    match: document.getElementById('lf-match').value, title: document.getElementById('lf-title').value,
    cause: document.getElementById('lf-cause').value, action: document.getElementById('lf-action').value,
    category: document.getElementById('lf-category').value }
  try {
    await api('/clients/fixes', { method: 'POST', body: JSON.stringify(body) })
    closeTeamFixForm(); toast(t('learn.saved'), 'success'); loadLearning()
  } catch (e) {
    toast(/match_not_in_logs/.test(e.message) ? t('learn.matchMissing') : /^400/.test(e.message) ? t('learn.invalid') : t('learn.error'), 'error')
  }
}
async function disableTeamFix(id) {
  if (!confirm(t('learn.confirmDisable'))) return
  try { await api('/clients/fixes/' + encodeURIComponent(id), { method: 'DELETE' }); toast(t('learn.disabled'), 'info'); loadLearning() }
  catch { toast(t('learn.error'), 'error') }
}

// ─── Journal d'audit (Enterprise) ─────────────────────────────────────────────
async function loadAudit() {
  const el = document.getElementById('audit-list'); if (!el) return
  try {
    const rows = await api('/clients/audit?limit=100')
    if (!rows.length) { el.innerHTML = `<div style="font-size:12px;color:var(--text3)">${t('audit.empty')}</div>`; return }
    el.innerHTML = rows.map(r => {
      const meta = (() => { try { return r.meta && r.meta !== '{}' ? JSON.stringify(typeof r.meta==='string'?JSON.parse(r.meta):r.meta) : '' } catch { return '' } })()
      return `<div class="settings-row" style="align-items:flex-start">
        <div style="min-width:0">
          <div class="settings-label" style="font-family:var(--mono);font-size:11px">
            <span style="color:var(--green)">${esc(r.action)}</span>
            ${r.resource_id ? `<span style="color:var(--text3)"> ${esc(r.resource)}:${esc(String(r.resource_id).slice(0,8))}</span>` : ''}
          </div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-top:2px">
            ${esc(r.actor || '—')}${r.ip ? ' · '+esc(r.ip) : ''}${meta ? ' · '+esc(meta).slice(0,80) : ''}
          </div>
        </div>
        <span style="font-size:10px;font-family:var(--mono);color:var(--text3);white-space:nowrap;flex-shrink:0">${fmtDateTime(r.created_at)}</span>
      </div>`
    }).join('')
  } catch(e) {
    const denied = /^403/.test(e.message)
    el.innerHTML = `<div style="font-size:12px;color:var(--text3)">${denied ? t('audit.denied') : '—'}</div>`
  }
}

// ─── Visite guidée (onboarding first-run) ─────────────────────────────────────
const TOUR = [
  { key:'welcome', view:'dashboard' },
  { key:'services',  sel:'#nav-monitors',  view:'dashboard' },
  { key:'create',    sel:'button[data-i18n="top.newMonitor"]' },
  { key:'overview',  sel:'#stats-row',     view:'dashboard' },
  { key:'ai',        sel:'#nav-analyses' },
  { key:'playground',sel:'#nav-playground' },
]
let tourIdx = 0

function tourVisible(sel) {
  if (!sel) return true
  const el = document.querySelector(sel)
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}
function tourStepsAvailable() { return TOUR.filter(s => tourVisible(s.sel)) }

function startTour(force) {
  if (!force && localStorage.getItem('cg_onboarded')) return
  if (!tourStepsAvailable().length) return
  tourIdx = 0
  document.body.classList.add('tour-on')
  showTourStep()
}
function endTour() {
  localStorage.setItem('cg_onboarded', '1')
  document.body.classList.remove('tour-on', 'tour-center')
  window.removeEventListener('resize', positionTour)
  document.querySelector('.content')?.removeEventListener('scroll', positionTour)
}
function tourNext() {
  let i = tourIdx + 1
  while (i < TOUR.length && !tourVisible(TOUR[i].sel)) i++
  if (i >= TOUR.length) { endTour(); return }
  tourIdx = i; showTourStep()
}
function tourPrev() {
  let i = tourIdx - 1
  while (i >= 0 && !tourVisible(TOUR[i].sel)) i--
  if (i < 0) return
  tourIdx = i; showTourStep()
}
function showTourStep() {
  const step = TOUR[tourIdx]
  if (step.view && currentView !== step.view) setView(step.view)
  // Libellés
  const steps = tourStepsAvailable()
  const pos   = steps.indexOf(step) + 1
  document.getElementById('tour-step').textContent  = `${pos} / ${steps.length}`
  document.getElementById('tour-title').textContent = t(`tour.${step.key}.t`)
  document.getElementById('tour-body').textContent  = t(`tour.${step.key}.b`)
  document.getElementById('tour-prev').style.visibility = (tourIdx === 0) ? 'hidden' : 'visible'
  document.getElementById('tour-next').textContent =
    (tourIdx >= TOUR.length - 1 || steps.indexOf(step) === steps.length - 1) ? t('tour.done') : t('tour.next')
  // Points
  document.getElementById('tour-dots').innerHTML =
    steps.map((s) => `<div class="tour-dot ${s === step ? 'on' : ''}"></div>`).join('')
  // Position
  requestAnimationFrame(positionTour)
  window.addEventListener('resize', positionTour)
  document.querySelector('.content')?.addEventListener('scroll', positionTour)
}
function positionTour() {
  const step = TOUR[tourIdx]
  const ring = document.getElementById('tour-ring')
  const pop  = document.getElementById('tour-pop')
  const el   = step.sel ? document.querySelector(step.sel) : null
  if (!el || !tourVisible(step.sel)) {
    // Étape centrée (welcome ou cible absente)
    document.body.classList.add('tour-center')
    pop.style.top  = '50%'; pop.style.left = '50%'; pop.style.transform = 'translate(-50%,-50%)'
    return
  }
  document.body.classList.remove('tour-center')
  const r = el.getBoundingClientRect()
  const pad = 6
  ring.style.top = (r.top - pad) + 'px'; ring.style.left = (r.left - pad) + 'px'
  ring.style.width = (r.width + pad*2) + 'px'; ring.style.height = (r.height + pad*2) + 'px'
  pop.style.transform = 'none'
  const pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 160, gap = 14
  let left = r.left, top = r.bottom + gap
  if (top + ph > innerHeight - 10) top = Math.max(10, r.top - ph - gap)   // pas la place dessous → dessus
  if (r.right + gap + pw < innerWidth - 10 && r.width < 260) { left = r.right + gap; top = r.top }  // sinon à droite
  left = Math.min(Math.max(10, left), innerWidth - pw - 10)
  top  = Math.min(Math.max(10, top),  innerHeight - ph - 10)
  pop.style.left = left + 'px'; pop.style.top = top + 'px'
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function setFilter(f, target) {
  currentFilter = f
  const sfx = target==='full'?'-f':''
  ;['all','alerts'].forEach(s => {
    const el = document.getElementById(`f-${s}${sfx}`)
    if (el) el.style.background = f===s ? 'var(--bg4)' : ''
  })
  renderMonitors(target||'dash')
}

function filterMonitors() {
  searchText = document.getElementById('search').value
  renderMonitors('dash'); renderMonitors('full')
}

function clearAnFilter() {
  anLocked = false; anMonitor = null
  document.getElementById('an-filter-badge').style.display='none'
  loadAnalyses()
}

// Réinitialise tous les filtres analyses (sévérité, catégorie, recherche, verrou monitor)
function resetAnFilters() {
  anSevFilter = 'all'; anCatFilter = 'all'; anSearch = ''
  const sev = document.getElementById('an-sev'); if (sev) sev.value = 'all'
  const cat = document.getElementById('an-cat'); if (cat) cat.value = 'all'
  const search = document.getElementById('an-search'); if (search) search.value = ''
  anLocked = false; anMonitor = null
  document.getElementById('an-filter-badge').style.display = 'none'
  loadAnalyses()
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function ago(iso) {
  if (!iso) return t('never')
  const d = Date.now() - new Date(iso).getTime()
  if (d < 10000)   return t('now')
  if (d < 60000)   return `${Math.round(d/1000)}s`
  if (d < 3600000) return `${Math.round(d/60000)}m`
  if (d < 86400000) return `${Math.round(d/3600000)}h`
  return `${Math.round(d/86400000)}j`
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function parse(s) { try { return JSON.parse(s) } catch { return null } }

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg||t('toast.copied'),'ok')).catch(() => toast(t('toast.copyFail'),'err'))
}

function copyKey(id) {
  copyText(document.getElementById(id).textContent.trim(), t('toast.copied'))
}

function toggleLog(id, btn) {
  const el = document.getElementById(id)
  const open = el.classList.toggle('open')
  btn.textContent = open ? `▼ ${t('log.hide')}` : `▶ ${t('log.show')} (${el.textContent.length}c)`
}

function copyApiKey()      { copyText(window._rawApiKey || '', t('toast.apiKeyCopied')) }
function copyInviteLink()  { copyText(document.getElementById('inv-link').dataset.url, t('toast.linkCopied')) }
function closeDelConfirm() { document.getElementById('del-confirm')?.remove() }

// ─── Actions déclaratives (CSP sans 'unsafe-inline') ─────────────────────────
// Aucun handler inline : data-click / data-input / data-change nomment une fonction globale,
// data-args porte ses arguments (JSON), data-pass ajoute l'élément (el) ou sa valeur (value).
// Seul le [data-click] le plus proche agit : remplace les event.stopPropagation() d'avant.
function runAction(el, attr) {
  const fn = window[el.getAttribute(attr)]
  if (typeof fn !== 'function') return
  const args = el.dataset.args ? JSON.parse(el.dataset.args) : []
  if (el.dataset.pass === 'el') args.push(el)
  else if (el.dataset.pass === 'value') args.push(el.value)
  fn.apply(el, args)
}
document.addEventListener('click', e => {
  const el = e.target.closest?.('[data-click]')
  if (el && (!el.hasAttribute('data-self') || e.target === el)) runAction(el, 'data-click')
})
for (const ev of ['input', 'change']) document.addEventListener(ev, e => {
  const el = e.target.closest?.(`[data-${ev}]`)
  if (el) runAction(el, `data-${ev}`)
})
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-key-click]')) { e.preventDefault(); e.target.click() }
})

// ─── Raccourcis clavier ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return
  if (e.key==='r'||e.key==='R') { e.preventDefault(); refreshAll(); toast(t('toast.refreshed'),'ok') }
  if (e.key==='/'){ e.preventDefault(); document.getElementById('search').focus() }
  if (e.key==='Escape') {
    if (document.body.classList.contains('tour-on')) { endTour(); return }
    const delC = document.getElementById('del-confirm')
    if (delC) delC.remove()
    else if (document.getElementById('drawer').classList.contains('open')) closeDrawer()
    else if (!document.getElementById('modal-bg').classList.contains('hidden')) closeModal()
    else if (!document.getElementById('edit-modal-bg').classList.contains('hidden')) closeEditModal()
    else if (!document.getElementById('invite-modal-bg').classList.contains('hidden')) closeInviteModal()
    else if (!document.getElementById('maint-modal-bg').classList.contains('hidden')) closeMaintenanceModal()
  }
  if (e.key==='1') setView('dashboard')
  if (e.key==='2') setView('monitors')
  if (e.key==='3') setView('logs')
  if (e.key==='4') setView('analyses')
  if (e.key==='5') setView('settings')
  if (e.key==='6') setView('docs')
  if (e.key==='7') setView('playground')
})

document.getElementById('auth-key').addEventListener('keydown', e => { if(e.key==='Enter') login() })
document.getElementById('modal-bg').addEventListener('click', e => { if(e.target===document.getElementById('modal-bg')) closeModal() })
document.getElementById('edit-modal-bg').addEventListener('click', e => { if(e.target===document.getElementById('edit-modal-bg')) closeEditModal() })
document.getElementById('invite-modal-bg').addEventListener('click', e => { if(e.target===document.getElementById('invite-modal-bg')) closeInviteModal() })
document.getElementById('maint-modal-bg').addEventListener('click', e => { if(e.target===document.getElementById('maint-modal-bg')) closeMaintenanceModal() })

// ─── Edit monitor ─────────────────────────────────────────────────────────────
function openEditModal(m) {
  editMonitorId = m.id
  document.getElementById('edit-modal-name').textContent = '// ' + m.name
  document.getElementById('em-name').value     = m.name || ''
  document.getElementById('em-env').value      = m.env || 'production'
  document.getElementById('em-grace').value    = m.grace_period || 300
  document.getElementById('em-schedule').value = m.schedule || ''
  document.getElementById('em-emin').value     = m.expected_min != null ? m.expected_min : ''
  document.getElementById('em-emax').value     = m.expected_max != null ? m.expected_max : ''
  document.getElementById('em-active').checked = m.active !== false
  document.getElementById('em-notes').value    = m.notes || ''
  document.getElementById('em-err').textContent = ''
  document.getElementById('edit-modal-bg').classList.remove('hidden')
  setTimeout(() => document.getElementById('em-name').focus(), 50)
}

function closeEditModal() {
  document.getElementById('edit-modal-bg').classList.add('hidden')
  editMonitorId = null
}

async function saveMonitor() {
  if (!editMonitorId) return
  const name     = document.getElementById('em-name').value.trim()
  const env      = document.getElementById('em-env').value
  const grace    = parseInt(document.getElementById('em-grace').value) || 300
  const schedule = document.getElementById('em-schedule').value.trim() || null
  const emin     = document.getElementById('em-emin').value ? parseInt(document.getElementById('em-emin').value) : null
  const emax     = document.getElementById('em-emax').value ? parseInt(document.getElementById('em-emax').value) : null
  const active   = document.getElementById('em-active').checked
  const notes    = document.getElementById('em-notes').value.trim().slice(0, 2000)
  if (!name) { document.getElementById('em-err').textContent = t('err.nameReq'); return }
  try {
    await api(`/monitors/${editMonitorId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, env, grace_period: grace, schedule, expected_min: emin, expected_max: emax, active, notes })
    })
    toast(t('toast.updated'), 'ok')
    closeEditModal()
    await loadMonitors()
    if (activeMonitor?.id === editMonitorId) {
      const updated = monitors.find(m => m.id === editMonitorId)
      if (updated) openDrawer(updated.id)
    }
  } catch(e) { document.getElementById('em-err').textContent = e.message }
}

// ─── Pending analysis ─────────────────────────────────────────────────────────
function markPending(monitorId) {
  pendingAnalysis.add(monitorId)
  // Auto-clear après 90s (le LLM devrait avoir répondu)
  setTimeout(() => {
    pendingAnalysis.delete(monitorId)
    renderMonitors('dash'); renderMonitors('full')
  }, 90000)
}

// ─── Settings ─────────────────────────────────────────────────────────────────
window._rawApiKey = ''

function toggleApiKey() {
  const el  = document.getElementById('set-key-hidden')
  const btn = this
  if (el.textContent.includes('•')) {
    el.textContent = window._rawApiKey || API_KEY
    btn.textContent = 'masquer'
  } else {
    el.textContent = '••••••••••••••••'
    btn.textContent = 'afficher'
  }
}

// Rotation de la clé du compte (owner). Invalide l'ancienne → on stocke la nouvelle.
async function rotateApiKey() {
  if (!confirm(t('confirm.rotate'))) return
  try {
    const r = await api('/clients/rotate-key', { method: 'POST' })
    API_KEY = r.api_key
    localStorage.setItem('cg_key', API_KEY)
    window._rawApiKey = API_KEY
    const el = document.getElementById('set-key-hidden')
    if (el) el.textContent = API_KEY
    toast(t('toast.keyRotated'), 'ok', 6000)
  } catch(e) { toast(e.message, 'err') }
}

// Rotation de la clé d'un membre (owner). La nouvelle clé est copiée pour transmission.
async function rotateMemberKey(id) {
  if (!confirm(t('confirm.rotateMember'))) return
  try {
    const r = await api(`/team/members/${id}/rotate-key`, { method: 'POST' })
    copyText(r.api_key, t('toast.keyRotatedCopied'))
  } catch(e) { toast(e.message, 'err') }
}

async function loadSettings() {
  try {
    const c = await api('/clients/me')
    window._rawApiKey = API_KEY
    document.getElementById('set-email').textContent    = c.email || '—'
    document.getElementById('set-plan').textContent     = c.plan || 'free'
    document.getElementById('set-monitors').textContent = `${c.monitor_count || 0}`
    if (c.plan === 'free') document.getElementById('trial-section').style.display = ''
    document.getElementById('set-status-url').textContent = `${BASE_URL}/status/{monitor_id}`

    if (c.slack_webhook)        document.getElementById('set-slack').value       = c.slack_webhook
    if (c.teams_webhook)        document.getElementById('set-teams').value       = c.teams_webhook
    for (const [k, v] of Object.entries(c.channels || {})) { const el = document.getElementById('set-ch-' + k); if (el) el.value = v }
    if (c.webhook_url)          document.getElementById('set-webhook').value     = c.webhook_url
    if (c.escalation_email)     document.getElementById('set-esc-email').value   = c.escalation_email
    if (c.escalation_webhook)   document.getElementById('set-esc-webhook').value = c.escalation_webhook
    if (c.escalation_after_min) document.getElementById('set-esc-delay').value   = c.escalation_after_min
    const langSel = document.getElementById('set-lang')
    if (langSel) langSel.value = localStorage.getItem('cg_lang') || ''
    const alertLang = document.getElementById('set-alert-lang')
    if (alertLang) alertLang.value = c.lang === 'en' ? 'en' : 'fr'
    loadTeamMembers()
    loadMaintenanceWindows()

    // Peuple le select timezone
    const tzSelect = document.getElementById('set-tz')
    const timezones = [
      'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid',
      'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Montreal',
      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Australia/Sydney', 'UTC'
    ]
    timezones.forEach(tz => {
      const opt = document.createElement('option')
      opt.value = tz; opt.textContent = tz
      if (tz === TZ) opt.selected = true
      tzSelect.appendChild(opt)
    })
  } catch(e) { console.error(e) }
}

// Langue des alertes : réglage du compte (toute l'équipe), distinct de la langue de l'interface (ce navigateur).
async function setAlertLang(lang) {
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({ lang }) })
    toast(t('toast.alertLangSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

async function saveSlack() {
  const webhook = document.getElementById('set-slack').value.trim()
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({ slack_webhook: webhook || '' }) })
    toast(t('toast.slackSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

async function saveTeams() {
  const url = document.getElementById('set-teams').value.trim()
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({ teams_webhook: url || '' }) })
    toast(t('toast.teamsSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

async function saveChannel(type) {
  const value = document.getElementById('set-ch-' + type).value.trim()
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({ channels: { [type]: value } }) })
    toast(t('toast.channelSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

async function saveWebhook() {
  const url = document.getElementById('set-webhook').value.trim()
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({ webhook_url: url || '' }) })
    toast(t('toast.webhookSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

function saveTz() {
  TZ = document.getElementById('set-tz').value
  localStorage.setItem('cg_tz', TZ)
  toast(t('toast.tzSaved'), 'ok')
}

async function startTrial() {
  try {
    await api('/auth/start-trial', { method: 'POST' })
    toast(t('toast.trialOn'), 'ok')
    document.getElementById('trial-section').style.display = 'none'
    loadSettings()
    loadClientInfo()
  } catch(e) { toast(e.message, 'err') }
}

// ─── Escalation ───────────────────────────────────────────────────────────────
async function saveEscalation() {
  const email   = document.getElementById('set-esc-email').value.trim()
  const webhook = document.getElementById('set-esc-webhook').value.trim()
  const delay   = parseInt(document.getElementById('set-esc-delay').value) || 30
  try {
    await api('/clients/settings', { method: 'PATCH', body: JSON.stringify({
      escalation_email:   email   || '',
      escalation_webhook: webhook || '',
      escalation_after_min: delay,
    })})
    toast(t('toast.escSaved'), 'ok')
  } catch(e) { toast(e.message, 'err') }
}

// ─── Maintenance windows ───────────────────────────────────────────────────────
async function loadMaintenanceWindows() {
  const el = document.getElementById('maint-windows-list'); if (!el) return
  try {
    const wins = await api('/maintenance-windows')
    if (!wins.length) { el.innerHTML = `<div style="font-size:12px;color:var(--text3)">${t('set.noWindows')}</div>`; return }
    el.innerHTML = wins.map(w => `
      <div class="settings-row">
        <div>
          <div class="settings-label" style="display:flex;align-items:center;gap:6px">
            ${esc(w.label || w.cron_expr)}
            ${w.active_now ? `<span style="font-size:9px;color:var(--green);font-family:var(--mono)">● ${t('set.active')}</span>` : ''}
          </div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text3)">${esc(w.cron_expr)} · ${w.duration_min}min${w.monitor_id?'':' · '+t('set.allMonitors')}</div>
        </div>
        <button class="btn btn-ghost" style="font-size:10px;color:var(--red)" data-click="deleteMaintenanceWindow" data-args="${esc(JSON.stringify([`${w.id}`]))}">${t('set.remove')}</button>
      </div>`).join('')
  } catch(e) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">—</div>' }
}

async function deleteMaintenanceWindow(id) {
  try {
    await api(`/maintenance-windows/${id}`, { method: 'DELETE' })
    toast(t('toast.mwDeleted'), 'ok')
    loadMaintenanceWindows()
  } catch(e) { toast(e.message, 'err') }
}

function openMaintenanceModal() {
  // Peuple le select monitor
  const sel = document.getElementById('mw-monitor')
  sel.innerHTML = `<option value="">${t('mod.mw.allMonitors')}</option>` +
    monitors.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')
  document.getElementById('mw-err').textContent = ''
  document.getElementById('maint-modal-bg').classList.remove('hidden')
}
function closeMaintenanceModal() { document.getElementById('maint-modal-bg').classList.add('hidden') }

async function createMaintenanceWindow() {
  const cron     = document.getElementById('mw-cron').value.trim()
  const duration = parseInt(document.getElementById('mw-duration').value) || 60
  const label    = document.getElementById('mw-label').value.trim()
  const monId    = document.getElementById('mw-monitor').value || null
  if (!cron) { document.getElementById('mw-err').textContent = t('err.cronReq'); return }
  try {
    await api('/maintenance-windows', { method: 'POST', body: JSON.stringify({ cron_expr: cron, duration_min: duration, label, monitor_id: monId || undefined }) })
    toast(t('toast.mwCreated'), 'ok')
    closeMaintenanceModal()
    loadMaintenanceWindows()
  } catch(e) { document.getElementById('mw-err').textContent = e.message }
}

// ─── Team / RBAC ───────────────────────────────────────────────────────────────
async function loadTeamMembers() {
  const el = document.getElementById('team-members-list'); if (!el) return
  try {
    const members = await api('/team/members')
    if (!members.length) { el.innerHTML = `<div style="font-size:12px;color:var(--text3)">${t('set.noMembers')}</div>`; return }
    el.innerHTML = members.map(m => `
      <div class="settings-row">
        <div>
          <div class="settings-label">${esc(m.email)}</div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text3)">
            <span style="color:${m.role==='admin'?'var(--amber)':m.role==='owner'?'var(--green)':'var(--text3)'}">${m.role}</span>
            ${m.invited_by ? ` · ${t('set.invitedBy')} ${esc(m.invited_by)}` : ''}
          </div>
        </div>
        <span style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost" style="font-size:10px" data-click="rotateMemberKey" data-args="${esc(JSON.stringify([`${m.id}`]))}">${t('set.rotate')}</button>
          <button class="btn btn-ghost" style="font-size:10px;color:var(--red)" data-click="removeTeamMember" data-args="${esc(JSON.stringify([`${m.id}`]))}">${t('set.remove')}</button>
        </span>
      </div>`).join('')
  } catch(e) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">—</div>' }

  // Invitations en attente
  const iel = document.getElementById('team-invites-list'); if (!iel) return
  try {
    const invites = await api('/team/invitations')
    if (!invites.length) { iel.innerHTML = ''; return }
    iel.innerHTML = `<div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin:10px 0 6px">${t('set.pending')} (${invites.length})</div>` +
      invites.map(i => `
        <div class="settings-row" style="opacity:.7">
          <div>
            <div class="settings-label" style="color:var(--text2)">${esc(i.email)}</div>
            <div style="font-size:10px;font-family:var(--mono);color:var(--text3)">${i.role} · ${t('set.expires')} ${fmtDateTime(i.expires_at)}</div>
          </div>
          <button class="btn btn-ghost" style="font-size:10px" data-click="cancelInvite" data-args="${esc(JSON.stringify([`${i.id}`]))}">${t('set.cancel')}</button>
        </div>`).join('')
  } catch(e) { iel.innerHTML = '' }
}

async function removeTeamMember(id) {
  try { await api(`/team/members/${id}`, { method: 'DELETE' }); toast(t('toast.memberRemoved'), 'ok'); loadTeamMembers() }
  catch(e) { toast(e.message, 'err') }
}

async function cancelInvite(id) {
  try { await api(`/team/invitations/${id}`, { method: 'DELETE' }); toast(t('toast.inviteCancelled'), 'ok'); loadTeamMembers() }
  catch(e) { toast(e.message, 'err') }
}

function openInviteModal() {
  document.getElementById('inv-email').value = ''
  document.getElementById('inv-err').textContent = ''
  document.getElementById('inv-success').style.display = 'none'
  document.getElementById('inv-btn').style.display = ''
  document.getElementById('invite-modal-bg').classList.remove('hidden')
}
function closeInviteModal() { document.getElementById('invite-modal-bg').classList.add('hidden') }

async function sendInvite() {
  const email = document.getElementById('inv-email').value.trim()
  const role  = document.getElementById('inv-role').value
  if (!email) { document.getElementById('inv-err').textContent = t('err.emailReq'); return }
  try {
    const r = await api('/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) })
    const linkEl = document.getElementById('inv-link')
    linkEl.textContent = r.accept_url
    linkEl.dataset.url = r.accept_url
    document.getElementById('inv-success').style.display = ''
    document.getElementById('inv-btn').style.display = 'none'
    document.getElementById('inv-err').textContent = ''
    toast(t('toast.inviteCreated'), 'ok')
    loadTeamMembers()
  } catch(e) { document.getElementById('inv-err').textContent = e.message }
}

// ─── Docs ─────────────────────────────────────────────────────────────────────
function copyCode(id) {
  const el = document.getElementById(id)
  // Supprime les boutons copier du texte
  const text = el.cloneNode(true)
  text.querySelectorAll('button').forEach(b => b.remove())
  text.querySelectorAll('span[id^="doc-url"]').forEach(s => s.replaceWith(BASE_URL))
  navigator.clipboard.writeText(text.textContent.trim())
    .then(() => toast(t('toast.codeCopied'), 'ok'))
    .catch(() => toast(t('toast.copyFail'), 'err'))
}

// ─── Mobile sidebar ──────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.querySelector('.sidebar')
  const backdrop = document.getElementById('sidebar-backdrop')
  sidebar.classList.toggle('open')
  backdrop.classList.toggle('show')
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open')
  document.getElementById('sidebar-backdrop').classList.remove('show')
}

// Ferme la sidebar mobile après navigation
const origSetView = setView
window.setView = function(view) {
  origSetView(view)
  if (window.innerWidth <= 768) closeSidebar()
}

// Lignes de log liées à la cause (recopiées des logs par le serveur, jamais générées).
function evidenceHtml(ev) {
  if (!Array.isArray(ev) || !ev.length) return ''
  return `<div class="an-evidence" title="${esc(t('an.evidenceTip'))}"><div class="an-evidence-h">${t('an.evidence')}</div>${ev.map(l => esc(String(l))).join('\n')}</div>`
}

// Correction connue (pack livré, déclenché par les logs) : masquée si une correction vérifiée existe.
function knownFixHtml(kf, verified) {
  if (!kf || verified || !Array.isArray(kf.steps)) return ''
  return `<div class="an-known" title="${esc(t('an.knownTip'))}"><div class="an-evidence-h">${t('an.known')}</div><div style="font-weight:600;color:var(--text)">${esc(kf.title)}</div><ul>${kf.steps.map(x => '<li>' + esc(String(x)) + '</li>').join('')}</ul></div>`
}

// Résolution constatée : ce qui a changé entre l'échec et la première réussite (relevé par le SDK, rien de deviné).
// Masquée une fois une correction enregistrée : la confirmation EST cette correction.
function resolutionHtml(a) {
  let r = a.resolution
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { r = null } }
  if (!r || a.verified_fix || !Array.isArray(r.changes)) return ''
  if (!r.changes.length) return `<div class="an-resolution an-resolution-none">${t('an.resolutionNone')}</div>`
  const line = c => esc(c.label) + (c.before !== undefined ? ` : <code>${esc(c.before)}</code> → <code>${esc(c.after)}</code>` : '')
  return `<div class="an-resolution"><div class="an-evidence-h">${t('an.resolution')}</div><ul>${r.changes.map(c => '<li>' + line(c) + '</li>').join('')}</ul>` +
    (r.text && a.id ? `<button class="btn btn-primary" style="font-size:11px;padding:4px 10px" data-click="confirmResolution" data-args="${esc(JSON.stringify([String(a.id), r.text]))}">${t('an.resolutionConfirm')}</button>` : '') + '</div>'
}

// « Qu'est-ce qui a changé depuis la dernière réussite ? » — empreinte relevée par le SDK, comparée à l'échec.
// Un fait, pas une cause : affiché à côté du diagnostic, jamais à sa place.
function changedHtml(a) {
  const step = a.step ? `<div class="an-resolution an-changed"><div class="an-evidence-h">${t('an.step')}</div>${esc(a.step)}</div>` : ''
  if (!Array.isArray(a.changed) || !a.changed.length) return step
  const line = c => esc(c.label) + (c.before !== undefined ? ` : <code>${esc(c.before)}</code> → <code>${esc(c.after)}</code>` : '')
  return `<div class="an-resolution an-changed"><div class="an-evidence-h">${t('an.changed')}</div><ul>${a.changed.map(c => '<li>' + line(c) + '</li>').join('')}</ul></div>` + step
}

async function confirmResolution(analysisId, text) {
  try {
    const r = await api(`/monitors/analyses/${analysisId}/fix`, { method: 'POST', body: JSON.stringify({ fix: text }) })
    if (r && r.demo) return
    toast(t('toast.fixSaved'), 'ok')
    await loadAnalyses()
  } catch(e) { toast(e.message, 'err') }
}

// Compte rendu d'incident : construit dans le navigateur à partir de l'analyse (textes déjà masqués côté serveur,
// aucune réécriture par l'IA). CronGuard n'envoie rien : brouillon dans la messagerie de l'utilisateur, qui le
// relit, le complète et l'envoie lui-même ; ou texte à copier (ticket, wiki, Slack).
function incidentReport(id) {
  const a = analysesData.find(x => String(x.id) === String(id))
  if (!a) return null
  const d = (typeof a.diagnosis === 'string' ? parse(a.diagnosis) : a.diagnosis) || {}
  let r = a.resolution
  if (typeof r === 'string') r = parse(r)
  const job = a.monitorName || a.monitor_name || '?'
  const L = []
  L.push(`${t('rep.job')} : ${job}${a.env ? ` (${a.env})` : ''}`)
  L.push(`${t('rep.failedAt')} : ${fmtDateTime(a.created_at)}${a.ping_exit_code != null ? ` · ${t('rep.exit')} ${a.ping_exit_code}` : ''}`)
  if (r?.at) L.push(`${t('rep.restored')} : ${fmtDateTime(r.at)} (≈ ${Math.max(1, Math.round((new Date(r.at) - new Date(a.created_at)) / 60000))} min)`)
  L.push('', `${t('rep.cause')} :`, d.cause || '—')
  if (a.explanation) L.push('', `${t('an.explain')} ${a.explanation}`)
  if (Array.isArray(a.evidence) && a.evidence.length) L.push('', t('an.evidence') + ' :', ...a.evidence.map(x => '  ' + x))
  if (r?.changes?.length) L.push('', t('an.resolution'), ...r.changes.map(c => `  - ${c.label}${c.before !== undefined ? ` : ${c.before} → ${c.after}` : ''}`))
  const fix = a.verified_fix   // texte brut (mail / presse-papiers), jamais injecté dans le HTML
  if (fix) L.push('', `${t('an.verified')} : ${fix}`)
  else if (d.action) L.push('', `${t('an.lead')} ${d.action}`)
  L.push('', `${t('rep.done')} :`, '  ', '', `${t('rep.link')} : ${location.origin}${location.pathname}`, '—', t('rep.footer'))
  return { subject: `[CronGuard] ${t('rep.subject')} — ${job}, ${fmtDateTime(a.created_at)}`, body: L.join('\n') }
}

function mailReport(id) {
  const rep = incidentReport(id)
  if (!rep) return
  const href = `mailto:?subject=${encodeURIComponent(rep.subject)}&body=${encodeURIComponent(rep.body)}`
  // Au-delà de ~1 800 caractères, certaines messageries tronquent un lien mailto : brouillon .eml à la place.
  if (href.length <= 1800) { location.href = href; return }
  const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  const eml = ['X-Unsent: 1', 'To: ', `Subject: =?UTF-8?B?${b64(rep.subject)}?=`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(rep.body.replace(/\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n')].join('\r\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }))
  link.download = 'compte-rendu-incident.eml'
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  toast(t('rep.emlSaved'), 'ok')
}

function copyReport(id) {
  const rep = incidentReport(id)
  if (rep) copyText(`${rep.subject}\n\n${rep.body}`, t('rep.copied'))
}

// ─── Feedback analyses ───────────────────────────────────────────────────────
async function recordFix(analysisId) {
  if (!analysisId) { toast(t('toast.missingId'), 'err'); return }
  const fix = window.prompt(t('fb.fixPrompt'))
  if (!fix || !fix.trim()) return
  try {
    await api(`/monitors/analyses/${analysisId}/fix`, { method: 'POST', body: JSON.stringify({ fix }) })
    toast(t('toast.fixSaved'), 'ok')
    if (!DEMO) await loadAnalyses()
  } catch(e) { toast(e.message, 'err') }
}

async function sendFeedback(analysisId, feedback, elementId) {
  if (!analysisId) { toast(t('toast.missingId'), 'err'); return }
  try {
    await api(`/monitors/analyses/${analysisId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback })
    })
    toast(feedback === 'positive' ? '👍 '+t('toast.fbThanks') : '👎 '+t('toast.fbNoted'), 'ok')
    // Met à jour les boutons visuellement
    const el = document.getElementById(elementId)
    if (el) {
      el.querySelectorAll('.fb-btn').forEach(b => { b.classList.remove('active-pos','active-neg') })
      const btn = el.querySelector(`.fb-btn:${feedback==='positive'?'first':'last'}-of-type`)
      if (btn) btn.classList.add(feedback==='positive'?'active-pos':'active-neg')
    }
  } catch(e) { toast(e.message, 'err') }
}


// ─── Quick error scenarios (playground) ──────────────────────────────────────
const QUICK_ERRORS = [
  {
    label: '🗄 DB deadlock',      category: 'database',
    job: 'cleanup-sessions',      exit: 1,
    logs: `ERROR:  deadlock detected
DETAIL:  Process 12345 waits for ShareLock on transaction 88472; blocked by process 12346.
         Process 12346 waits for ShareLock on transaction 88471; blocked by process 12345.
HINT:  See server log for query details.
CONTEXT: while updating tuple (0,43) in relation "user_sessions"
ROLLBACK: 0 rows deleted`
  },
  {
    label: '🌐 ECONNREFUSED',     category: 'network',
    job: 'etl-warehouse',         exit: 1,
    logs: `Connecting to warehouse 10.0.1.45:5439...
ConnectionError: connect ECONNREFUSED 10.0.1.45:5439
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1716:16) {
  errno: -4078, code: 'ECONNREFUSED', syscall: 'connect'
}
Retrying (1/3)... ECONNREFUSED
Retrying (2/3)... ECONNREFUSED
All retries exhausted. ETL aborted. Records: 0/847392`
  },
  {
    label: '💥 OOM killed',       category: 'resources',
    job: 'reindex-search',        exit: 137,
    logs: `Starting Elasticsearch reindex (2.4M documents)
Progress: 38% (912,000 / 2,400,000)
Process killed by OOM killer (exit code 137)
Killed
dmesg: Out of memory: Killed process 23847 (node) total-vm:4892840kB, anon-rss:3891232kB`
  },
  {
    label: '⏱ Grace timeout',    category: 'timeout',
    job: 'export-reports',        exit: 124,
    logs: `[INFO] Generating PDF reports: 201/384 (52%)
[INFO] ETA: 35 min remaining
[WARNING] Memory usage 89% (7.1 GB / 8 GB)
Timeout: job exceeded 3600s grace period
Process killed. Generated: 201/384 reports — INCOMPLETE`
  },
  {
    label: '🧩 TypeError JS',     category: 'code',
    job: 'send-digests',          exit: 1,
    logs: `TypeError: Cannot read properties of undefined (reading 'email')
    at buildDigest (/app/src/services/digest.js:134:28)
    at async processSubscriptions (/app/src/services/digest.js:89:5)
0 / 1247 digests sent`
  },
  {
    label: '📊 Data quality',     category: 'data',
    job: 'validate-pipeline',     exit: 1,
    logs: `Validation failed: 23,847 records with NULL customer_id
Validation failed: 847 records with future timestamps
Validation failed: price_usd contains negative values (min: -99.99)
Data quality score: 29.7% (threshold: 95%)
Pipeline aborted. 0 records written to production tables.`
  },
  {
    label: '🔌 Rate limit 429',   category: 'dependency',
    job: 'sync-invoices',         exit: 1,
    logs: `Fetching from Stripe API...
StripeRateLimitError: Too Many Requests
  statusCode: 429
  headers: { 'retry-after': '29', 'x-ratelimit-remaining-requests': '0' }
Processed: 0 / ~2400 invoices. Aborting.`
  },
]

function initQuickErrors() {
  const container = document.getElementById('quick-errors')
  if (!container) return
  const catColors = {
    database:'var(--blue)',network:'var(--purple)',resources:'var(--red)',
    timeout:'var(--amber)',code:'var(--text2)',data:'var(--indigo)',dependency:'var(--green)'
  }
  container.innerHTML = QUICK_ERRORS.map((s, i) => `
    <button class="quick-err-btn"
      style="color:${catColors[s.category]||'var(--text2)'};border-color:${catColors[s.category]||'var(--border2)'}20"
      data-click="loadScenario" data-args="${esc(JSON.stringify([i]))}">${s.label}</button>
  `).join('')
}

function loadScenario(i) {
  const s = QUICK_ERRORS[i]
  clearPreview()
  document.getElementById('pg-job').value   = s.job
  document.getElementById('pg-exit').value  = String(s.exit)
  document.getElementById('pg-logs').value  = s.logs
  document.getElementById('pg-env').value   = 'production'
}

async function runPreview() {
  const logs    = document.getElementById('pg-logs').value.trim()
  const jobName = document.getElementById('pg-job').value.trim() || 'test-job'
  const env     = document.getElementById('pg-env').value
  const exitCode= parseInt(document.getElementById('pg-exit').value) || 1

  if (!logs) { toast(t('toast.pasteLogs'), 'err'); return }

  document.getElementById('pg-spinner').classList.add('show')
  document.getElementById('pg-result').classList.remove('show')
  const spinnerTxt = document.getElementById('pg-spinner-text')
  const model = window._activeModel || 'LLM'
  const steps = [
    `${t('pg.step.tokenize')} (${logs.length} chars)...`,
    `${t('pg.step.send')} ${model}...`,
    t('pg.step.cause'),
    t('pg.step.reco'),
    t('pg.step.final'),
  ]
  let stepIdx = 0
  if (spinnerTxt) spinnerTxt.textContent = steps[0]
  const stepTimer = setInterval(() => {
    stepIdx = Math.min(stepIdx + 1, steps.length - 1)
    if (spinnerTxt) spinnerTxt.textContent = steps[stepIdx]
  }, 7000)

  try {
    const r = await api('/monitors/analyze/preview', {
      method: 'POST',
      body: JSON.stringify({ logs, job_name: jobName, env, exit_code: exitCode })
    })
    renderPreviewResult(r)
  } catch(e) {
    let errData = null
    try { errData = JSON.parse(e.message.replace(/^\d+: /, '')) } catch {}

    const resultEl = document.getElementById('pg-result')

    if (errData) {
      // Affiche toujours l'erreur dans le panneau résultat (plus visible qu'un toast)
      const actionsHtml = (errData.actions||[]).map(a =>
        `<div style="font-size:11px;font-family:var(--mono);color:var(--text2);padding:3px 0;display:flex;gap:8px">
           <span style="color:var(--green);flex-shrink:0">→</span>${esc(a)}
         </div>`
      ).join('')

      const availableHtml = errData.available?.length
        ? `<div style="margin-top:8px;font-size:10px;font-family:var(--mono);color:var(--text3)">
             ${t('pg.res.models')} ${esc(errData.available.slice(0,3).join(', '))}
           </div>` : ''

      resultEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:16px">⚠</span>
          <span style="color:var(--red);font-weight:600;font-size:13px">${esc(errData.error||t('pg.res.errTitle'))}</span>
        </div>
        ${errData.detail  ? `<div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-bottom:10px;padding:6px 10px;background:var(--bg);border-radius:4px">${esc(errData.detail)}</div>` : ''}
        ${errData.hint    ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">💡 ${esc(errData.hint)}</div>` : ''}
        ${errData.fix     ? `<div style="font-family:var(--mono);font-size:11px;color:var(--green);padding:6px 10px;background:var(--green-dim);border-radius:4px;margin-bottom:8px">${esc(errData.fix)}</div>` : ''}
        ${errData.timeout ? `<div style="font-size:10px;font-family:var(--mono);color:var(--text3)">${t('pg.res.timeout')} ${esc(errData.timeout)} · ${t('pg.res.model')} ${esc(errData.model||'?')}</div>` : ''}
        ${actionsHtml}
        ${availableHtml}`
      resultEl.classList.add('show')
    } else {
      toast(e.message, 'err')
    }
  } finally {
    clearInterval(stepTimer)
    document.getElementById('pg-spinner').classList.remove('show')
  }
}

function renderPreviewResult(r) {
  const catColors = {
    database:'var(--blue)',network:'var(--purple)',resources:'var(--red)',
    timeout:'var(--amber)',code:'var(--text2)',data:'var(--indigo)',
    dependency:'var(--green)',unknown:'var(--text3)'
  }
  const impactLabel = {none:t('di.none'),possible:t('di.possible'),confirmed:t('di.confirmed')}
  const sev = r.severity || 'medium'
  const cat = r.category || 'unknown'
  const conf= r.confidence || 'medium'

  const checksHtml = (r.checks||[]).map(c =>
    `<div class="pr-check">${esc(String(c))}</div>`
  ).join('')

  document.getElementById('pg-result').innerHTML = `
    <div class="pr-header">
      <span class="an-cat cat-${esc(cat)}">${esc(cat)}</span>
      <span class="sev-pill sev-${esc(sev)}">${esc(sev)}</span>
      <span class="an-confidence conf-${esc(conf)}">${esc(conf)}</span>
      <span class="data-impact impact-${esc(r.data_impact||'none')}">${impactLabel[r.data_impact]||'?'}</span>
      ${r.fix_minutes ? `<span class="fix-time">~<span>${r.fix_minutes}</span>min</span>` : ''}
      <span style="font-size:9px;font-family:var(--mono);color:var(--text3);margin-left:auto">${esc(r.model||'knowledge')}${r._meta?.explainModel ? ' · ' + esc(r._meta.explainModel) : ''}</span>
    </div>
    <div class="pr-cause">🔍 ${esc(r.cause||'—')}</div>
    ${r.explanation ? `<div class="an-explain"><span class="an-checks-label">${t('an.explain')}</span> ${esc(r.explanation)}</div>` : ''}
    ${evidenceHtml(r.evidence)}
    ${knownFixHtml(r.known_fix, false)}
    ${r.action    ? `<div class="pr-action">→ ${t('an.lead')} ${esc(r.action)}</div>` : ''}
    ${r.prevention? `<div class="pr-prevention">🛡 ${esc(r.prevention)}</div>` : ''}
    ${checksHtml ? `<div class="pr-checks"><div style="font-size:9px;color:var(--text3);font-family:var(--sans);font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${t('pg.res.checks')}</div>${checksHtml}</div>` : ''}
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:9px;font-family:var(--mono);color:var(--text3)">
      ${r._meta ? `${r._meta.logs_length} ${t('pg.res.analyzed')}${r.tokensIn ? ` · ${r.tokensIn} tokens in · ${r.tokensOut||0} tokens out` : ''}` : ''}
      ${r.fromCache ? ` · <span style="color:var(--amber)">⚡ ${t('pg.res.fromCache')}</span>` : ''}
    </div>`
  document.getElementById('pg-result').classList.add('show')
}

function clearPreview() {
  document.getElementById('pg-result').classList.remove('show')
  document.getElementById('pg-result').innerHTML = ''
  document.getElementById('pg-spinner').classList.remove('show')
  document.getElementById('pg-logs').value = ''
  document.getElementById('pg-job').value  = 'mon-cron-job'
  document.getElementById('pg-exit').value = '1'
}

// ─── Métriques qualité ────────────────────────────────────────────────────────
let metricsVisible = true

function toggleMetrics() {
  metricsVisible = !metricsVisible
  document.getElementById('quality-grid').style.display = metricsVisible ? 'grid' : 'none'
  document.getElementById('toggle-metrics').textContent = metricsVisible ? t('antb.hide') : t('antb.details')
  if (metricsVisible) renderQualityMetrics(analysesData)
}

// Bandeau résumé compact — toujours visible en tête de l'onglet
function renderAnSummary(analyses) {
  const el = document.getElementById('an-summary')
  if (!el) return
  if (!analyses.length) { el.innerHTML = ''; return }
  const total  = analyses.length
  const urgent = analyses.filter(a => ['critical','high'].includes(anSeverity(a))).length
  const cats = {}
  analyses.forEach(a => { const c = anCategory(a); cats[c] = (cats[c]||0)+1 })
  const topCat = Object.entries(cats).sort(([,x],[,y]) => y-x)[0]
  const fixTimes = analyses.filter(a => a.fix_minutes > 0).map(a => a.fix_minutes)
  const avgFix = fixTimes.length ? Math.round(fixTimes.reduce((a,b)=>a+b,0)/fixTimes.length) : 0
  el.innerHTML = `
    <div class="stat stat-ai"><div class="stat-label">${t('ansum.analyses')}</div><div class="stat-val">${total}</div><div class="stat-sub">${t('ansum.analysesSub')}</div></div>
    <div class="stat stat-fail"><div class="stat-label">${t('ansum.todo')}</div><div class="stat-val">${urgent}</div><div class="stat-sub">${t('ansum.todoSub')}</div></div>
    <div class="stat stat-uptime"><div class="stat-label">${t('ansum.topCat')}</div><div class="stat-val" style="font-size:18px">${topCat?topCat[0]:'—'}</div><div class="stat-sub">${topCat?topCat[1]+' '+t('ansum.cases'):''}</div></div>
    <div class="stat stat-late"><div class="stat-label">${t('ansum.resolution')}</div><div class="stat-val">${avgFix||'—'}</div><div class="stat-sub">${t('ansum.resolutionSub')}</div></div>`
}

function renderQualityMetrics(analyses) {
  if (!analyses.length) return

  // Catégories
  const cats = {}
  analyses.forEach(a => {
    const d = typeof a.diagnosis==='string' ? parse(a.diagnosis) : a.diagnosis
    const cat = d?.category || a.category || 'unknown'
    cats[cat] = (cats[cat]||0) + 1
  })
  const maxCat = Math.max(...Object.values(cats))
  const catColors = {
    database:'var(--blue)',network:'var(--purple)',resources:'var(--red)',
    timeout:'var(--amber)',code:'var(--text2)',data:'var(--indigo)',
    dependency:'var(--green)',unknown:'var(--bg4)'
  }
  document.getElementById('cat-bars').innerHTML = Object.entries(cats)
    .sort(([,a],[,b]) => b-a)
    .map(([cat, count]) => `
      <div class="cat-bar-row">
        <div class="cat-bar-label" style="color:${catColors[cat]||'var(--text3)'}">${esc(cat)}</div>
        <div class="cat-bar-wrap">
          <div class="cat-bar-fill" style="width:${Math.round(count/maxCat*100)}%;background:${catColors[cat]||'var(--bg4)'}"></div>
        </div>
        <div class="cat-bar-count">${count}</div>
      </div>`).join('')

  // Confiance
  const confs = {high:0,medium:0,low:0}
  analyses.forEach(a => { const c=a.confidence||'medium'; confs[c]=(confs[c]||0)+1 })
  document.getElementById('conf-circles').innerHTML = [
    {k:'high',   label:t('conf.high'),   color:'var(--green)',  sub:t('conf.highSub')},
    {k:'medium', label:t('conf.medium'), color:'var(--amber)',  sub:t('conf.mediumSub')},
    {k:'low',    label:t('conf.low'),    color:'var(--text3)',  sub:t('conf.lowSub')},
  ].map(({k,label,color,sub}) => `
    <div class="conf-circle">
      <div class="conf-dot" style="background:${color}"></div>
      <div class="conf-info">
        <div class="conf-label">${label} (${confs[k]||0})</div>
        <div class="conf-sub">${sub}</div>
      </div>
    </div>`).join('')

  // Fix minutes moyen
  const fixTimes = analyses.filter(a => a.fix_minutes > 0).map(a => a.fix_minutes)
  const avgFix = fixTimes.length ? Math.round(fixTimes.reduce((a,b)=>a+b,0)/fixTimes.length) : 0
  document.getElementById('avg-fix').textContent = avgFix || '—'

  // Impact données
  const impacts = {none:0,possible:0,confirmed:0}
  analyses.forEach(a => { const i=a.data_impact||'none'; impacts[i]=(impacts[i]||0)+1 })
  document.getElementById('impact-bar').innerHTML = [
    {k:'none',       label:'OK',    color:'var(--green-dim)',  textColor:'var(--green)'},
    {k:'possible',   label:'?',     color:'var(--amber-dim)',  textColor:'var(--amber)'},
    {k:'confirmed',  label:'⚠',    color:'var(--red-dim)',    textColor:'var(--red)'},
  ].map(({k,label,color,textColor}) => impacts[k] ? `
    <span style="font-size:10px;font-family:var(--mono);padding:2px 8px;border-radius:20px;background:${color};color:${textColor}">${label} ${impacts[k]}</span>
  ` : '').join('')
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Met à jour les URLs dans la doc
function updateDocUrls() {
  document.querySelectorAll('[id^="doc-url"]').forEach(el => { el.textContent = BASE_URL })
}

// Traduit le chrome statique (auth overlay + sidebar + settings + modals) au chargement
applyI18n()
applyTheme()

// A11y : rend les items de navigation (div onclick) opérables au clavier
document.querySelectorAll('.s-item').forEach(el => {
  el.setAttribute('tabindex', '0')
  el.setAttribute('role', 'button')
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click() }
  })
})

// ─── A11y : focus-trap générique pour dialogs ─────────────────────────────────
// Réagit aux toggles existants (.hidden / .open / display) sans toucher open/close.
let _trapped = null, _lastFocus = null
function _focusables(el) {
  return [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(e => e.offsetParent !== null)
}
function _visibleDialog() {
  const del = document.getElementById('del-confirm'); if (del) return del
  const dr = document.getElementById('drawer'); if (dr && dr.classList.contains('open')) return dr
  const mb = [...document.querySelectorAll('.modal-bg')].find(m => !m.classList.contains('hidden')); if (mb) return mb
  const auth = document.getElementById('auth-overlay'); if (auth && getComputedStyle(auth).display !== 'none') return auth
  return null
}
function _syncFocusTrap() {
  const d = _visibleDialog()
  if (d === _trapped) return
  if (!_trapped && d) _lastFocus = document.activeElement   // mémorise le déclencheur
  _trapped = d
  if (d) {
    const f = _focusables(d)
    if (f.length) setTimeout(() => { if (_trapped === d && !d.contains(document.activeElement)) f[0].focus() }, 30)
  } else if (_lastFocus && _lastFocus.focus && document.contains(_lastFocus)) {
    try { _lastFocus.focus() } catch (e) {}
    _lastFocus = null
  }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !_trapped) return
  const f = _focusables(_trapped); if (!f.length) return
  const first = f[0], last = f[f.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  else if (!_trapped.contains(document.activeElement)) { e.preventDefault(); first.focus() }
})
const _trapObs = new MutationObserver(_syncFocusTrap)
;['drawer','modal-bg','edit-modal-bg','invite-modal-bg','maint-modal-bg','auth-overlay'].forEach(id => {
  const el = document.getElementById(id)
  if (el) _trapObs.observe(el, { attributes: true, attributeFilter: ['class','style'] })
})
_trapObs.observe(document.body, { childList: true })   // del-confirm créé/retiré dynamiquement
_syncFocusTrap()

// SSO forward-auth : si le dashboard est servi derrière le proxy SSO du client,
// /auth/whoami (même origine) renvoie l'identité injectée → on boot sans clé.
async function trySSO() {
  try {
    const r = await fetch('/auth/whoami', { headers: { 'Content-Type': 'application/json' } })
    if (!r.ok) return false
    const me = await r.json()
    if (me && me.via === 'sso') {
      API_KEY = ''; BASE_URL = ''          // même origine, identité via le proxy
      window._ssoEmail = me.email || null
      boot()
      return true
    }
  } catch { /* pas de SSO → écran de connexion classique */ }
  return false
}

try { if (localStorage.getItem('cg_adv') === '1') showAdvancedSettings(true) } catch { /* stockage indisponible */ }

if (DEMO) {
  startDemo()
} else if (API_KEY) {
  document.getElementById('auth-key').value = API_KEY
  document.getElementById('auth-url').value = BASE_URL
  boot()
} else {
  document.getElementById('auth-url').value = BASE_URL
  trySSO()   // si échec, l'écran de saisie de clé reste affiché
}
