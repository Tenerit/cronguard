import 'dotenv/config'
import { llmEnabled } from '../services/llm/analyzer'
import { validateEnv } from '../config/env'
validateEnv()

// Garde clé Stripe : surface au boot une clé absente / mal formée (guillemets, espaces,
// préfixe invalide) ou une clé STANDARD live (accès total). Évite un échec d'auth opaque.
{
  const sk = process.env.STRIPE_SECRET_KEY
  if (!sk) {
    console.warn('⚠  STRIPE_SECRET_KEY absent — paiements désactivés')
  } else if (!/^(rk|sk)_(test|live)_[A-Za-z0-9]+$/.test(sk)) {
    console.warn('⚠  STRIPE_SECRET_KEY mal formée (attendu rk_/sk_…, SANS guillemets ni espaces) — Stripe rejettera l\'auth')
  } else if (sk.startsWith('sk_live_')) {
    console.warn('⚠  STRIPE_SECRET_KEY = clé STANDARD live (accès total) — préférez une clé RESTREINTE rk_live_ (moindre privilège)')
  }
  // Clé présente sans secret webhook = TOUS les webhooks Stripe échouent (signature) :
  // le client paie mais n'est jamais upgradé. Échec silencieux → on le surface au boot.
  if (sk && !process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠  STRIPE_SECRET_KEY présente mais STRIPE_WEBHOOK_SECRET absent — les webhooks Stripe échoueront (400), aucun upgrade ne sera traité')
  }
}

import express   from 'express'
import cors      from 'cors'
import helmet    from 'helmet'
import rateLimit from 'express-rate-limit'
import { db, initDb } from '../db'
import { redis }  from '../config/redis'
import { logger } from '../config/logger'

import { CSP_DIRECTIVES }  from './csp'
import { escapeHtml }      from '../services/escape'
import { requireApiKey }  from './middleware/auth'
import { metricsHandler } from './routes/metrics'
import { pingRouter }     from './routes/ping'
import { monitorsRouter } from './routes/monitors'
import { dashboardRouter } from './routes/dashboard'
import { clientsRouter }       from './routes/clients'
import { maintenanceRouter }   from './routes/maintenance'
import { teamRouter }          from './routes/team'
import { webhookRouter, accountRouter } from './routes/billing'
import { PLANS, Plan }         from '../config/plans'

// Vérifie la connexion DB au démarrage
initDb()
  .then(startServer)
  .catch(err => { console.error('[API] DB init failed:', err.message); process.exit(1) })

const app = express()

function startServer() {

// ─── Middlewares globaux ──────────────────────────────────────────────────────

// CSP : durcissement defense-in-depth. Directives dans ./csp (testées sans boot).
// 'unsafe-inline' conservé pour script/style (handlers inline du dashboard) ; les
// vecteurs durs (object/base/frame/form) sont bloqués. Voir csp.ts pour le détail.
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
}))
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false)
app.use(cors({
  origin:       process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  methods:      ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','X-API-Key','Authorization'],
  credentials:  true,
}))

// ─── Rate limiting global ─────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 60_000, max: 200,
  keyGenerator: (req) => (req.headers['x-api-key'] as string) ?? req.ip ?? 'unknown',
  message: { error: 'Rate limit exceeded' },
})

// Limiteur strict, keyé par IP, pour les routes sensibles potentiellement non-authentifiées
// (auth/SSO, billing) → anti-bruteforce / abus. Plus serré que l'API limiter clé-API.
const authLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: { error: 'Trop de requêtes' },
})

// ─── Routes ───────────────────────────────────────────────────────────────────

// Stripe webhook : raw body AVANT express.json(). webhookRouter ne contient QUE
// /stripe (pas de routes compte) → rien d'exposé ici sans rate-limit.
app.use('/webhooks', webhookRouter)

app.use(express.json({ limit: '64kb' }))

// Identité courante (clé API OU SSO forward-auth) — permet au dashboard de
// détecter une session SSO et de sauter l'écran de saisie de clé.
app.get('/auth/whoami', apiLimiter, requireApiKey, (_req, res) => {
  res.json({
    clientId: res.locals.clientId,
    role:     res.locals.role,
    plan:     res.locals.plan,
    email:    res.locals.email ?? null,
    via:      res.locals.authVia ?? 'apikey',
  })
})

app.use('/auth',     authLimiter, accountRouter)
app.use('/billing',  authLimiter, accountRouter)
app.use('/ping',     pingRouter)

// ─── Pages HTML (avant les routers API qui demandent auth) ────────────────────
// Doit être en premier : app.use('/dashboard', requireApiKey) capturerait sinon le GET /dashboard

app.get('/dashboard', (_, res) => res.sendFile('dashboard.html', { root: __dirname }))

// Page publique de tarifs (sert aussi de cancel_url Stripe). Rendue depuis PLANS
// → une seule source de vérité pour les prix et les features.
app.get('/pricing', (_req, res) => {
  const card = (p: Plan) => `
    <div class="plan${p.id === 'pro' ? ' pro' : ''}">
      <h2>${p.name}</h2>
      <div class="price">${p.priceUsd === 0 ? 'Free' : `$${p.priceUsd}<span>/mo</span>`}</div>
      <ul>${p.features.map(f => `<li>${f}</li>`).join('')}</ul>
      <a class="cta${p.id === 'pro' ? '' : ' ghost'}" href="/dashboard">${p.id === 'pro' ? 'Upgrade in dashboard →' : 'Start free →'}</a>
    </div>`
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>CronGuard — Pricing</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0e1117;color:#e6edf3;margin:0;padding:48px 16px;text-align:center}
  h1{font-size:28px;margin:0 0 8px} .sub{color:#8b949e;margin:0 0 40px}
  .plans{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;max-width:760px;margin:0 auto}
  .plan{background:#161b22;border:1px solid #30363d;border-radius:14px;padding:28px;width:300px;text-align:left}
  .plan.pro{border-color:#8957e5}
  .plan h2{margin:0 0 4px} .price{font-size:32px;font-weight:700;margin:0 0 16px} .price span{font-size:15px;color:#8b949e;font-weight:400}
  ul{list-style:none;padding:0;margin:0 0 24px} li{padding:6px 0;color:#c9d1d9} li::before{content:"✓ ";color:#3fb950}
  .cta{display:block;text-align:center;padding:10px;border-radius:8px;background:#238636;color:#fff;text-decoration:none;font-weight:500}
  .cta.ghost{background:transparent;border:1px solid #30363d;color:#c9d1d9}
</style></head><body>
<h1>CronGuard pricing</h1>
<p class="sub">Self-hosted is free. Hosted Pro unlocks AI root-cause analysis &amp; unlimited monitors.</p>
<div class="plans">${card(PLANS.free)}${card(PLANS.pro)}</div>
</body></html>`)
})

app.use('/monitors',             apiLimiter, requireApiKey, monitorsRouter)
app.use('/dashboard',            apiLimiter, requireApiKey, dashboardRouter)
app.use('/clients',              apiLimiter, requireApiKey, clientsRouter)
app.use('/maintenance-windows',  apiLimiter, requireApiKey, maintenanceRouter)
// /team/invite/accept est public (pas de requireApiKey) — doit être avant requireApiKey
app.use('/team/invite/accept',   apiLimiter, teamRouter)
app.use('/team',                 apiLimiter, requireApiKey, teamRouter)

// ─── Pages HTML ───────────────────────────────────────────────────────────────

// Badge SVG — embeddable dans README, docs, etc.
// GET /badge/:monitorId → SVG status badge (sans auth)
app.get('/badge/:monitorId', async (req, res) => {
  try {
    const { rows: [m] } = await db.query(
      `SELECT name, last_status FROM monitors WHERE id=$1 AND active=true`,
      [req.params.monitorId]
    )
    const status  = (m?.last_status ?? 'unknown') as string
    const label   = m?.name ?? 'cronguard'
    const colors: Record<string, string> = { ok: '#2dba8c', failed: '#e05252', late: '#d4a017', unknown: '#484f58' }
    const texts:  Record<string, string> = { ok: 'operational', failed: 'outage', late: 'degraded', unknown: 'unknown' }
    const color   = colors[status]  ?? '#484f58'
    const text    = texts[status]   ?? 'unknown'
    const labelW  = Math.min(label.length * 6.5 + 16, 200)
    const valueW  = text.length * 6.5 + 16
    const totalW  = labelW + valueW

    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'no-cache, max-age=60')
    // Le nom du monitor est contrôlé par l'utilisateur et injecté dans ce SVG servi
    // sans auth. On l'échappe (ci-dessous) ET on bloque tout script si le badge est
    // ouvert comme document top-level (défense en profondeur ; un SVG inline peut exécuter).
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW/2}" y="15" fill="#010101" fill-opacity=".3">${escapeHtml(label)}</text>
    <text x="${labelW/2}" y="14">${escapeHtml(label)}</text>
    <text x="${labelW+valueW/2}" y="15" fill="#010101" fill-opacity=".3">${escapeHtml(text)}</text>
    <text x="${labelW+valueW/2}" y="14">${escapeHtml(text)}</text>
  </g>
</svg>`)
  } catch {
    res.status(500).send('')
  }
})

app.get('/status/:monitorId', (req, res) => {
  if (req.headers.accept?.includes('text/html') && !req.headers['x-api-key'])
    return res.sendFile('status.html', { root: __dirname })

  db.query(`
    SELECT m.name, m.last_status, m.last_ping_at, m.env, m.schedule,
      COALESCE(json_agg(json_build_object('status',p.status,'pinged_at',p.pinged_at)
        ORDER BY p.pinged_at DESC) FILTER (WHERE p.id IS NOT NULL), '[]') AS recent_pings
    FROM monitors m
    LEFT JOIN LATERAL (
      SELECT id,status,pinged_at FROM pings WHERE monitor_id=m.id ORDER BY pinged_at DESC LIMIT 90
    ) p ON true
    WHERE m.id=$1 AND m.active=true GROUP BY m.id
  `, [req.params.monitorId]).then(({ rows: [m] }) =>
    m ? res.json(m) : res.status(404).json({ error: 'Not found' })
  )
})

// ─── Health & Error ───────────────────────────────────────────────────────────

app.get('/metrics', metricsHandler)
if (!process.env.METRICS_TOKEN && process.env.METRICS_PUBLIC !== 'true') {
  logger.warn('[Metrics] /metrics fermé (401) — définissez METRICS_TOKEN, ou METRICS_PUBLIC=true pour l\'exposer sur un réseau interne')
}

app.get('/health', async (_, res) => {
  try {
    await Promise.all([db.query('SELECT 1'), redis.ping()])
    res.json({
      ok:    true,
      ts:    new Date(),
      model: llmEnabled() ? (process.env.LLM_MODEL ?? 'llama3.2:3b') : 'none',
    })
  }
  catch { res.status(503).json({ ok: false }) }
})

app.use((err: Error, req: express.Request, res: express.Response, _: express.NextFunction) => {
  logger.error('[API] Unhandled', { path: req.path, err: err.message })
  res.status(500).json({ error: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000')
app.listen(PORT, () => logger.info(`[API] :${PORT}`))

}

process.on('uncaughtException', (err) => {
  logger.error('[API] Uncaught exception', { err: err.message, stack: err.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('[API] Unhandled rejection', { reason: String(reason) })
  process.exit(1)
})

export default app
