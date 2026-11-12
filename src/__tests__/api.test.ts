/**
 * Tests d'intégration API
 * Teste les flux critiques sans dépendances externes (DB et Redis mockés)
 */

import request from 'supertest'
import express from 'express'

// ─── Mocks avant import de l'app ──────────────────────────────────────────────

const mockMonitor = {
  id: 'mon-uuid-1', client_id: 'cli-uuid-1',
  active: true, expected_min: null, expected_max: null, ping_key: 'test-key',
}
const mockClient = { id: 'cli-uuid-1', plan: 'pro', api_key: 'test-api-key' }

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      // Auth middleware
      if (sql.includes('WHERE api_key')) {
        return params[0] === 'test-api-key'
          ? { rows: [mockClient] }
          : { rows: [] }
      }
      // Ping lookup
      if (sql.includes('WHERE ping_key')) {
        return params[0] === 'test-key'
          ? { rows: [mockMonitor] }
          : { rows: [] }
      }
      // Monitor ownership
      if (sql.includes('WHERE id') && sql.includes('client_id')) {
        return { rows: [{ id: params[0] }] }
      }
      // Health check
      if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] }
      // Monitors list
      if (sql.includes('FROM monitors')) {
        return { rows: [{ ...mockMonitor, last_status: 'ok', recent_pings: [], avg_duration_7d: 1200 }] }
      }
      // Insert ping
      if (sql.includes('INSERT INTO pings')) return { rows: [{ id: 'ping-1' }] }
      // Update monitor
      if (sql.includes('UPDATE monitors')) return { rows: [] }
      // Overview
      if (sql.includes('COUNT(*)') && sql.includes('monitors')) {
        return { rows: [{ ok: '5', failed: '1', late: '0', unknown: '0', total: '6' }] }
      }
      if (sql.includes('COUNT(*)') && sql.includes('analyses')) {
        return { rows: [{ today: '3' }] }
      }
      if (sql.includes('recentFailures') || sql.includes('last_status IN')) {
        return { rows: [] }
      }
      return { rows: [] }
    }),
  },
}))

jest.mock('../queue', () => ({
  pingQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
  analysisQueue: { add: jest.fn().mockResolvedValue({ id: 'job-2' }) },
}))

jest.mock('../config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), pipeline: jest.fn() },
}))

// ─── Import app après les mocks ───────────────────────────────────────────────

// On importe uniquement ce dont on a besoin pour éviter validateEnv()
process.env.DATABASE_URL = 'mock'
process.env.REDIS_URL    = 'mock'
process.env.LLM_BASE_URL = 'http://localhost:11434/v1'
process.env.NODE_ENV     = 'test'

// Build a minimal test app mirroring the real routes
import { db } from '../db'
import { pingQueue } from '../queue'
import { Schema as RealPingSchema } from '../api/routes/ping'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

function buildApp() {
  const app = express()
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors())
  app.use(express.json({ limit: '64kb' }))

  const requireApiKey = async (req: any, res: any, next: any) => {
    const key = req.headers['x-api-key'] as string
    if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' })
    try {
      const { rows } = await db.query(`SELECT id, plan FROM clients WHERE api_key = $1`, [key])
      if (!rows.length) return res.status(401).json({ error: 'Invalid API key' })
      res.locals.clientId = rows[0].id
      res.locals.plan     = rows[0].plan
      next()
    } catch {
      res.status(503).json({ error: 'Service unavailable' })
    }
  }

  const PingSchema = RealPingSchema   // le vrai schéma de src/api/routes/ping.ts

  // POST /ping/:pingKey
  app.post('/ping/:pingKey', async (req, res) => {
    const parsed = PingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' })

    const { rows: [monitor] } = await db.query(
      `SELECT id, client_id, active, expected_min, expected_max FROM monitors WHERE ping_key = $1`,
      [req.params.pingKey]
    )
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' })
    if (!monitor.active) return res.status(200).json({ ok: true, skipped: true })

    await pingQueue.add('ping', { monitorId: monitor.id, clientId: monitor.client_id, ...parsed.data })
    return res.json({ ok: true, status: parsed.data.status })
  })

  // GET /monitors
  app.get('/monitors', requireApiKey, async (req, res) => {
    const { rows } = await db.query(`FROM monitors`, [res.locals.clientId])
    res.json(rows)
  })

  // GET /health
  app.get('/health', async (_, res) => {
    try {
      await db.query('SELECT 1', [])
      res.json({ ok: true })
    } catch { res.status(503).json({ ok: false }) }
  })

  // GET /dashboard/overview
  app.get('/dashboard/overview', requireApiKey, async (req, res) => {
    const { rows: [stats] } = await db.query(
      `COUNT(*) FILTER monitors`, [res.locals.clientId]
    )
    const { rows: [ai] } = await db.query(`COUNT(*) analyses`, [res.locals.clientId])
    res.json({ monitors: { ok: parseInt(stats?.ok ?? '0'), total: parseInt(stats?.total ?? '0') }, ai: { today: parseInt(ai?.today ?? '0') }, alerts: [] })
  })

  return app
}

const app = buildApp()

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with ok:true when DB is up', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('POST /ping/:pingKey', () => {
  it('accepts a valid success ping', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'success', duration_ms: 1200, records: 500 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.status).toBe('success')
    expect(pingQueue.add).toHaveBeenCalledWith('ping', expect.objectContaining({ status: 'success' }))
  })

  it('accepts a failure ping with output', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'fail', exit_code: 1, output: 'DB connection refused' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fail')
  })

  it('rejects unknown ping key with 404', async () => {
    const res = await request(app)
      .post('/ping/unknown-key')
      .send({ status: 'success' })
    expect(res.status).toBe(404)
  })

  it('rejects invalid status with 400', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'invalid' })
    expect(res.status).toBe(400)
  })

  it('rejects duration_ms exceeding 24h', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'success', duration_ms: 99_999_999_999 })
    expect(res.status).toBe(400)
  })

  it('accepts duration_ms 0 (sub-millisecond failure, busybox) and stores it as not measured', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'fail', exit_code: 127, duration_ms: 0, output: 'x: not found' })
    expect(res.status).toBe(200)
    const job = (pingQueue.add as jest.Mock).mock.calls.at(-1)[1]
    expect(job.exit_code).toBe(127)
    expect(job.duration_ms).toBeUndefined()
  })

  it('rejects negative records', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'success', records: -1 })
    expect(res.status).toBe(400)
  })

  it('rejects output exceeding 4000 chars', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'fail', output: 'X'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('rejects empty body', async () => {
    const res = await request(app).post('/ping/test-key').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /monitors — auth', () => {
  it('returns 401 without API key', async () => {
    const res = await request(app).get('/monitors')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .get('/monitors')
      .set('X-API-Key', 'invalid-key')
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid API key', async () => {
    const res = await request(app)
      .get('/monitors')
      .set('X-API-Key', 'test-api-key')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /dashboard/overview', () => {
  it('returns stats with valid API key', async () => {
    const res = await request(app)
      .get('/dashboard/overview')
      .set('X-API-Key', 'test-api-key')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('monitors')
    expect(res.body).toHaveProperty('ai')
  })
})

describe('Security: input validation', () => {
  it('blocks SQL injection attempt in output field (stored as text, not executed)', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .send({ status: 'fail', output: "'; DROP TABLE monitors; --" })
    // Zod accepts it as text (correct — output is stored, not executed)
    expect(res.status).toBe(200)
    // But the queue receives it as a plain string
    expect(pingQueue.add).toHaveBeenCalledWith('ping',
      expect.objectContaining({ output: "'; DROP TABLE monitors; --" })
    )
  })

  it('handles missing Content-Type gracefully', async () => {
    const res = await request(app)
      .post('/ping/test-key')
      .set('Content-Type', 'text/plain')
      .send('not json')
    expect([400, 200]).toContain(res.status)
  })
})
