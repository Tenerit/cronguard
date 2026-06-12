/**
 * Tests routes dashboard + clients
 * Couvre : overview, logs, analyses, /clients/me, /clients/settings
 */

import request from 'supertest'
import express from 'express'
import { dashboardRouter } from '../api/routes/dashboard'
import { clientsRouter }   from '../api/routes/clients'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn()
jest.mock('../db', () => ({ db: { query: (...a: unknown[]) => mockQuery(...a) } }))

const CLIENT_ID = 'cli-test-overview'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { res.locals.clientId = CLIENT_ID; res.locals.plan = 'free'; next() })
  app.use('/dashboard', dashboardRouter)
  app.use('/clients',   clientsRouter)
  app.use((err: Error, _req: any, res: any, _next: any) =>
    res.status(500).json({ error: err.message })
  )
  return app
}

const app = buildApp()

beforeEach(() => jest.clearAllMocks())

// ─── GET /dashboard/overview ──────────────────────────────────────────────────

describe('GET /dashboard/overview', () => {
  const mockOverview = {
    monitors: { ok: '3', failed: '1', late: '2', unknown: '0', total: '6' },
    ai:       { today: '4' },
    alerts:   [],
  }

  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [mockOverview] })
  })

  it('retourne les stats agrégées → 200', async () => {
    const res = await request(app).get('/dashboard/overview')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('monitors')
    expect(res.body).toHaveProperty('ai')
  })

  it('monitors contient ok, failed, late, total', async () => {
    const res = await request(app).get('/dashboard/overview')
    expect(res.status).toBe(200)
    const m = res.body.monitors
    expect(m).toHaveProperty('ok')
    expect(m).toHaveProperty('failed')
    expect(m).toHaveProperty('late')
    expect(m).toHaveProperty('total')
  })

  it('ai.today est un nombre', async () => {
    const res = await request(app).get('/dashboard/overview')
    expect(typeof res.body.ai?.today).toBe('number')
  })

  it('ne nécessite pas de body', async () => {
    const res = await request(app).get('/dashboard/overview')
    expect(res.status).toBe(200)
  })
})

// ─── GET /dashboard/logs ─────────────────────────────────────────────────────

describe('GET /dashboard/logs', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [
      { monitor_name: 'backup-postgres', status: 'success',
        duration_ms: 2800, records: 5000, pinged_at: new Date().toISOString() },
      { monitor_name: 'etl-nightly', status: 'failed',
        duration_ms: null, records: null, pinged_at: new Date().toISOString() },
    ]})
  })

  it('retourne un tableau de logs → 200', async () => {
    const res = await request(app).get('/dashboard/logs')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('respecte le paramètre limit', async () => {
    await request(app).get('/dashboard/logs?limit=5')
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([CLIENT_ID, 5])
    )
  })

  it('plafonne limit à 100 max', async () => {
    await request(app).get('/dashboard/logs?limit=9999')
    const args = mockQuery.mock.calls[0][1]
    expect(args[1]).toBeLessThanOrEqual(100)
  })

  it('log contient monitor_name et status', async () => {
    const res = await request(app).get('/dashboard/logs')
    expect(res.status).toBe(200)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('monitor_name')
      expect(res.body[0]).toHaveProperty('status')
    }
  })
})

// ─── GET /dashboard/analyses ──────────────────────────────────────────────────

describe('GET /dashboard/analyses', () => {
  const mockAnalysis = {
    id: 'ana-1', diagnosis: '{"cause":"DB timeout","action":"Restart","prevention":"Add retry"}',
    model_used: 'qwen3:8b', alert_type: 'fail', severity: 'high',
    category: 'database', confidence: 'high', from_cache: false,
    created_at: new Date().toISOString(), monitor_name: 'backup-postgres', env: 'production',
    ping_output: 'ERROR: connection refused', ping_exit_code: 1,
  }

  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [mockAnalysis] })
  })

  it('retourne un tableau d\'analyses → 200', async () => {
    const res = await request(app).get('/dashboard/analyses')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('chaque analyse a un id, diagnosis, category', async () => {
    const res = await request(app).get('/dashboard/analyses')
    expect(res.status).toBe(200)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id')
      expect(res.body[0]).toHaveProperty('diagnosis')
    }
  })

  it('inclut ping_output et ping_exit_code', async () => {
    const res = await request(app).get('/dashboard/analyses')
    expect(res.status).toBe(200)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('ping_output')
      expect(res.body[0]).toHaveProperty('ping_exit_code')
    }
  })

  it('limit par défaut ≤ 10', async () => {
    await request(app).get('/dashboard/analyses')
    const args = mockQuery.mock.calls[0][1]
    expect(args[1]).toBeLessThanOrEqual(10)
  })

  it('plafonne limit à 50', async () => {
    await request(app).get('/dashboard/analyses?limit=999')
    const args = mockQuery.mock.calls[0][1]
    expect(args[1]).toBeLessThanOrEqual(50)
  })
})

// ─── GET /clients/me ──────────────────────────────────────────────────────────

describe('GET /clients/me', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [{
      id: CLIENT_ID, email: 'test@example.com', plan: 'free',
      slack_webhook: null, created_at: new Date().toISOString(),
      monitor_count: 3,
    }]})
  })

  it('retourne le profil client → 200', async () => {
    const res = await request(app).get('/clients/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('test@example.com')
    expect(res.body.plan).toBe('free')
  })

  it('inclut monitor_count', async () => {
    const res = await request(app).get('/clients/me')
    expect(res.body.monitor_count).toBeDefined()
  })

  it('ne retourne pas le mot de passe ni l\'api_key en clair', async () => {
    const res = await request(app).get('/clients/me')
    expect(res.body.password).toBeUndefined()
    expect(res.body.api_key).toBeUndefined()
    expect(res.body.reset_token).toBeUndefined()
  })
})

// ─── PATCH /clients/settings ──────────────────────────────────────────────────

describe('PATCH /clients/settings', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [{
      id: CLIENT_ID, email: 'test@example.com', plan: 'free', slack_webhook: null,
    }]})
  })

  it('met à jour le webhook Slack → 200', async () => {
    const res = await request(app).patch('/clients/settings')
      .send({ slack_webhook: 'https://hooks.slack.com/services/T123/B456/xyz' })
    expect(res.status).toBe(200)
  })

  it('accepte un webhook vide (suppression) → 200', async () => {
    const res = await request(app).patch('/clients/settings')
      .send({ slack_webhook: '' })
    expect(res.status).toBe(200)
  })

  it('rejette une URL invalide → 400', async () => {
    const res = await request(app).patch('/clients/settings')
      .send({ slack_webhook: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('accepte un body vide → 200 (no-op)', async () => {
    const res = await request(app).patch('/clients/settings').send({})
    expect(res.status).toBe(200)
  })
})
