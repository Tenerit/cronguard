import 'dotenv/config'
import { validateEnv } from '../config/env'
validateEnv()

if (!process.env.STRIPE_SECRET_KEY)
  console.warn('⚠  STRIPE_SECRET_KEY absent — paiements désactivés')

import express   from 'express'
import cors      from 'cors'
import helmet    from 'helmet'
import rateLimit from 'express-rate-limit'
import { db, initDb } from '../db'
import { redis }  from '../config/redis'
import { logger } from '../config/logger'

import { requireApiKey }  from './middleware/auth'
import { metricsHandler } from './routes/metrics'
import { pingRouter }     from './routes/ping'
import { monitorsRouter } from './routes/monitors'
import { dashboardRouter } from './routes/dashboard'
import { clientsRouter }       from './routes/clients'
import { maintenanceRouter }   from './routes/maintenance'
import { teamRouter }          from './routes/team'
import billingRouter           from './routes/billing'

// Vérifie la connexion DB au démarrage
initDb()
  .then(startServer)
  .catch(err => { console.error('[API] DB init failed:', err.message); process.exit(1) })

const app = express()

function startServer() {

// ─── Middlewares globaux ──────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }))
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// Stripe webhook : raw body AVANT express.json()
app.use('/webhooks', billingRouter)

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

app.use('/auth',     billingRouter)
app.use('/billing',  billingRouter)
app.use('/ping',     pingRouter)

// ─── Pages HTML (avant les routers API qui demandent auth) ────────────────────
// Doit être en premier : app.use('/dashboard', requireApiKey) capturerait sinon le GET /dashboard

app.get('/dashboard', (_, res) => res.sendFile('dashboard.html', { root: __dirname }))

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
    <text x="${labelW/2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelW/2}" y="14">${label}</text>
    <text x="${labelW+valueW/2}" y="15" fill="#010101" fill-opacity=".3">${text}</text>
    <text x="${labelW+valueW/2}" y="14">${text}</text>
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
if (!process.env.METRICS_TOKEN) {
  logger.warn('[Metrics] /metrics non protégé (METRICS_TOKEN absent) — n\'exposez ce port que sur réseau interne, ou définissez METRICS_TOKEN')
}

app.get('/health', async (_, res) => {
  try {
    await Promise.all([db.query('SELECT 1'), redis.ping()])
    res.json({
      ok:    true,
      ts:    new Date(),
      model: process.env.LLM_MODEL ?? 'llama3.2:3b',
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
