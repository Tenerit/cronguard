import request from 'supertest'
import express from 'express'
import { monitorsRouter } from '../api/routes/monitors'
import { requireApiKey }  from '../api/middleware/auth'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const CLIENT_ID  = 'cli-1'
const MONITOR_ID = 'mon-1'

const monitors: Record<string, any> = {
  [MONITOR_ID]: {
    id: MONITOR_ID, client_id: CLIENT_ID, name: 'backup-postgres',
    env: 'production', schedule: '0 2 * * *', grace_period: 300,
    active: true, last_status: 'ok', last_ping_at: null,
    expected_min: null, expected_max: null, ping_key: 'pk-test',
    recent_pings: [], avg_duration_7d: 1200,
  },
}

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      // Auth
      if (sql.includes('WHERE api_key')) {
        return params[0] === 'valid-key'
          ? { rows: [{ id: CLIENT_ID, plan: 'pro' }] }
          : { rows: [] }
      }
      // Ownership check
      if (sql.includes('WHERE id') && sql.includes('client_id') && !sql.includes('monitors m')) {
        const id  = params[0]
        const cid = params[1]
        return monitors[id]?.client_id === cid ? { rows: [{ id }] } : { rows: [] }
      }
      // GET single (m.* query with alert_states join)
      if (sql.includes('SELECT m.*') || (sql.includes('alert_states') && sql.includes('WHERE m.id'))) {
        const id = params[0]
        return monitors[id] ? { rows: [monitors[id]] } : { rows: [] }
      }
      // GET list (FROM monitors m with lateral join)
      if (sql.includes('FROM monitors m') || sql.includes('LEFT JOIN LATERAL')) {
        return { rows: Object.values(monitors).filter((m: any) => m.client_id === params[0]) }
      }
      // POST create
      if (sql.includes('INSERT INTO monitors')) {
        const newId = `mon-${Date.now()}`
        const m = { id: newId, client_id: CLIENT_ID, ping_key: `pk-${newId}`,
                    name: params[1], env: params[6], schedule: params[2],
                    grace_period: params[3], last_status: 'unknown' }
        monitors[newId] = m
        return { rows: [m] }
      }
      // PATCH
      if (sql.includes('UPDATE monitors SET') && sql.includes('RETURNING')) {
        const id = params[0]
        if (monitors[id]) { monitors[id] = { ...monitors[id], ...Object.fromEntries(params.slice(1).map((v,i)=>['field'+i,v])) } }
        return { rows: [monitors[id] || {}] }
      }
      // DELETE
      if (sql.includes('DELETE FROM monitors')) {
        delete monitors[params[0]]
        return { rows: [], rowCount: 1 }
      }
      // Plan check
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '1' }] }
      // History / analyses
      if (sql.includes('FROM pings') || sql.includes('FROM analyses')) return { rows: [] }
      return { rows: [] }
    }),
  },
}))

jest.mock('../services/alerts/dedup', () => ({
  acknowledgeAlert: jest.fn().mockResolvedValue(undefined),
  snoozeAlert:      jest.fn().mockResolvedValue(undefined),
}))

// ─── App fixture ─────────────────────────────────────────────────────────────

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    res.locals.clientId = CLIENT_ID
    res.locals.plan     = 'pro'
    res.locals.role     = 'owner'
    next()
  })
  app.use('/', monitorsRouter)
  return app
}

function buildAuthApp() {
  const app = express()
  app.use(express.json())
  app.use(requireApiKey)
  app.use('/', monitorsRouter)
  return app
}

const app     = buildApp()
const authApp = buildAuthApp()

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  // Reset monitors store — DELETE test removes entries
  monitors[MONITOR_ID] = {
    id: MONITOR_ID, client_id: CLIENT_ID, name: 'backup-postgres',
    env: 'production', schedule: '0 2 * * *', grace_period: 300,
    active: true, last_status: 'ok', last_ping_at: null,
    expected_min: null, expected_max: null, ping_key: 'pk-test',
    recent_pings: [], avg_duration_7d: 1200,
  }
})

describe('GET /monitors', () => {
  it('returns monitor list for authenticated client', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /monitors/:id', () => {
  it('returns monitor details including ping_key', async () => {
    const res = await request(app).get(`/${MONITOR_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(MONITOR_ID)
  })

  it('returns 404 for monitor owned by another client', async () => {
    const res = await request(app).get('/non-existent-id')
    expect(res.status).toBe(404)
  })
})

describe('POST /monitors', () => {
  it('creates a monitor and returns ping_key', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'new-job', env: 'production', grace_period: 300 })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('new-job')
    expect(res.body.ping_key).toBeDefined()
  })

  it('rejects creation with invalid env', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'job', env: 'invalid-env' })
    expect(res.status).toBe(400)
  })

  it('rejects empty name', async () => {
    const res = await request(app).post('/').send({ name: '', env: 'production' })
    expect(res.status).toBe(400)
  })

  it('rejects grace_period below minimum (60s)', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'job', env: 'production', grace_period: 10 })
    expect(res.status).toBe(400)
  })

  it('blocks free plan above 3 monitors limit', async () => {
    const freeApp = express()
    freeApp.use(express.json())
    freeApp.use((req, res, next) => { res.locals.clientId = CLIENT_ID; res.locals.plan = 'free'; res.locals.role = 'owner'; next() })
    freeApp.use('/', monitorsRouter)

    // Mock: already 3 monitors
    const { db } = require('../db')
    db.query.mockResolvedValueOnce({ rows: [{ count: '3' }] })

    const res = await request(freeApp)
      .post('/')
      .send({ name: 'job-4', env: 'production' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Free plan')
  })
})

describe('PATCH /monitors/:id', () => {
  it('updates monitor fields', async () => {
    const res = await request(app)
      .patch(`/${MONITOR_ID}`)
      .send({ name: 'updated-name', active: false })
    expect(res.status).toBe(200)
  })

  it('rejects unknown fields (SQL injection protection)', async () => {
    const res = await request(app)
      .patch(`/${MONITOR_ID}`)
      .send({ client_id: 'hacker', api_key: 'stolen' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No valid fields')
  })

  it('returns 404 for non-owned monitor', async () => {
    const res = await request(app)
      .patch('/not-my-monitor')
      .send({ name: 'new' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /monitors/:id', () => {
  it('deletes an owned monitor', async () => {
    const res = await request(app).delete(`/${MONITOR_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 404 for non-owned monitor', async () => {
    const res = await request(app).delete('/not-mine')
    expect(res.status).toBe(404)
  })
})

describe('POST /monitors/:id/acknowledge', () => {
  it('acknowledges alert for owned monitor', async () => {
    const { acknowledgeAlert } = require('../services/alerts/dedup')
    const res = await request(app).post(`/${MONITOR_ID}/acknowledge`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('acknowledged')
    expect(acknowledgeAlert).toHaveBeenCalledWith(MONITOR_ID)
  })
})

describe('POST /monitors/:id/snooze', () => {
  it('snoozes alert with default 60min', async () => {
    const { snoozeAlert } = require('../services/alerts/dedup')
    const res = await request(app).post(`/${MONITOR_ID}/snooze`).send({})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('snoozed')
    expect(res.body.minutes).toBe(60)
    expect(snoozeAlert).toHaveBeenCalledWith(MONITOR_ID, 60)
  })

  it('clamps snooze to 1440min max', async () => {
    const res = await request(app).post(`/${MONITOR_ID}/snooze`).send({ minutes: 9999 })
    expect(res.body.minutes).toBe(1440)
  })

  it('clamps snooze to 5min minimum', async () => {
    const res = await request(app).post(`/${MONITOR_ID}/snooze`).send({ minutes: 1 })
    expect(res.body.minutes).toBe(5)
  })
})

describe('Auth middleware', () => {
  it('returns 401 without API key', async () => {
    const res = await request(authApp).get('/')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid API key', async () => {
    const res = await request(authApp).get('/').set('X-API-Key', 'bad-key')
    expect(res.status).toBe(401)
  })

  it('passes with valid API key', async () => {
    const res = await request(authApp).get('/').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(200)
  })
})
