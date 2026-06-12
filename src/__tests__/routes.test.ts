/**
 * Tests des routes restantes :
 *  - POST /ping/:key       (ping.ts)
 *  - GET  /dashboard/*     (dashboard.ts)
 *  - GET  /clients/me      (clients.ts)
 *  - PATCH /clients/settings
 */

import request from 'supertest'
import express from 'express'
import { pingRouter }      from '../api/routes/ping'
import { dashboardRouter } from '../api/routes/dashboard'
import { clientsRouter }   from '../api/routes/clients'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const CLIENT_ID = 'cli-1'

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      // Ping lookup
      if (sql.includes('WHERE ping_key')) {
        return params[0] === 'valid-key'
          ? { rows: [{ id: 'mon-1', client_id: CLIENT_ID, active: true, expected_min: null, expected_max: null }] }
          : { rows: [] }
      }
      // Inactive monitor
      if (sql.includes('WHERE ping_key') && params[0] === 'inactive-key') {
        return { rows: [{ id: 'mon-2', client_id: CLIENT_ID, active: false }] }
      }
      // Dashboard overview CTE
      if (sql.includes('monitor_counts') && sql.includes('ai_counts')) {
        return { rows: [{ monitors: { ok:'5',failed:'1',late:'0',unknown:'0',total:'6' }, ai: { today:'3' }, alerts: [] }] }
      }
      // Dashboard logs
      if (sql.includes('FROM pings p') && sql.includes('LEFT JOIN analyses')) {
        return { rows: [{ status:'success', duration_ms:1200, monitor_name:'backup-job', env:'production', pinged_at: new Date() }] }
      }
      // Dashboard analyses
      if (sql.includes('FROM analyses a') && sql.includes('JOIN monitors m')) {
        return { rows: [{ id:'ana-1', diagnosis:'{"cause":"test"}', model_used:'qwen3:8b', severity:'high', created_at: new Date(), monitor_name:'backup-job', env:'production' }] }
      }
      // Client me
      if (sql.includes('SELECT id, email, plan')) {
        return { rows: [{ id: CLIENT_ID, email:'test@example.com', plan:'pro', slack_webhook:null, created_at: new Date(), monitor_count:'3' }] }
      }
      // Client settings update
      if (sql.includes('UPDATE clients') && sql.includes('slack_webhook')) {
        return { rows: [{ id: CLIENT_ID, email:'test@example.com', plan:'pro', slack_webhook: params[1], app_url: params[2] }] }
      }
      return { rows: [] }
    }),
  },
}))

jest.mock('../queue', () => ({
  pingQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
}))

// ─── App fixtures ─────────────────────────────────────────────────────────────

function buildPingApp() {
  const app = express()
  app.use(express.json())
  app.use('/', pingRouter)
  return app
}

function buildAuthApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { res.locals.clientId = CLIENT_ID; next() })
  app.use('/', router)
  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, _: express.NextFunction) => {
    res.status(500).json({ error: err.message })
  })
  return app
}

const pingApp      = buildPingApp()
const dashboardApp = buildAuthApp(dashboardRouter)
const clientsApp   = buildAuthApp(clientsRouter)

beforeEach(() => jest.clearAllMocks())

// ─── Ping route ───────────────────────────────────────────────────────────────

describe('POST /ping/:pingKey', () => {
  it('accepts success ping and queues it', async () => {
    const { pingQueue } = require('../queue')
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'success', duration_ms: 1200, records: 5000 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(pingQueue.add).toHaveBeenCalledWith('ping', expect.objectContaining({ status: 'success' }))
  })

  it('accepts fail ping with logs', async () => {
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'fail', exit_code: 1, output: 'Connection refused' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fail')
  })

  it('returns 404 for unknown ping key', async () => {
    const res = await request(pingApp)
      .post('/unknown-key')
      .send({ status: 'success' })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid payload', async () => {
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'invalid-status' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for duration_ms over 24h', async () => {
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'success', duration_ms: 99_999_999_999 })
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative records', async () => {
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'success', records: -1 })
    expect(res.status).toBe(400)
  })

  it('returns 400 for output over 4000 chars', async () => {
    const res = await request(pingApp)
      .post('/valid-key')
      .send({ status: 'fail', output: 'X'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('async errors are caught by express error handler', async () => {
    const { db } = require('../db')
    db.query.mockRejectedValueOnce(new Error('DB crash'))
    const app = express()
    app.use(express.json())
    app.use('/', pingRouter)
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message })
    })
    const res = await request(app).post('/valid-key').send({ status: 'success' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB crash')
  })
})

// ─── Dashboard routes ─────────────────────────────────────────────────────────

describe('GET /dashboard/overview', () => {
  it('returns aggregated stats in one call', async () => {
    const { db } = require('../db')
    const res = await request(dashboardApp).get('/overview')
    expect(res.status).toBe(200)
    expect(res.body.monitors).toBeDefined()
    expect(res.body.monitors.ok).toBe(5)
    expect(res.body.monitors.total).toBe(6)
    expect(res.body.ai.today).toBe(3)
    expect(db.query).toHaveBeenCalledTimes(1) // single CTE query
  })
})

describe('GET /dashboard/logs', () => {
  it('returns recent activity', async () => {
    const res = await request(dashboardApp).get('/logs')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('respects limit query param (max 100)', async () => {
    await request(dashboardApp).get('/logs?limit=999')
    const { db } = require('../db')
    const lastCall = db.query.mock.calls[db.query.mock.calls.length - 1]
    const limit = lastCall[1]?.[1]
    expect(limit).toBeLessThanOrEqual(100)
  })
})

describe('GET /dashboard/analyses', () => {
  it('returns recent AI analyses', async () => {
    const res = await request(dashboardApp).get('/analyses')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

// ─── Clients routes ───────────────────────────────────────────────────────────

describe('GET /clients/me', () => {
  it('returns client profile', async () => {
    const res = await request(clientsApp).get('/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('test@example.com')
    expect(res.body.plan).toBe('pro')
    expect(res.body.monitor_count).toBe('3')
  })
})

describe('PATCH /clients/settings', () => {
  it('updates slack webhook', async () => {
    const res = await request(clientsApp)
      .patch('/settings')
      .send({ slack_webhook: 'https://hooks.slack.com/test' })
    expect(res.status).toBe(200)
    expect(res.body.slack_webhook).toBe('https://hooks.slack.com/test')
  })

  it('rejects invalid slack webhook URL', async () => {
    const res = await request(clientsApp)
      .patch('/settings')
      .send({ slack_webhook: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('accepts empty string to remove webhook', async () => {
    const res = await request(clientsApp)
      .patch('/settings')
      .send({ slack_webhook: '' })
    expect(res.status).toBe(200)
  })
})
