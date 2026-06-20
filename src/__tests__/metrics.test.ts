import { metricsHandler } from '../api/routes/metrics'
import { redis } from '../config/redis'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('NOT EXISTS'))      return { rows: [{ n: 7 }] }   // analysis gaps
      if (sql.includes('GROUP BY last_status')) return { rows: [{ last_status: 'failed', n: 2 }] }
      if (sql.includes('alert_states'))    return { rows: [{ n: 1 }] }
      return { rows: [{ n: 0 }] }
    }),
  },
}))

jest.mock('../config/redis', () => ({ redis: { get: jest.fn(), llen: jest.fn() } }))
const mockRedis = redis as unknown as { get: jest.Mock; llen: jest.Mock }

function fakeRes() {
  const res: any = { _status: 200, _body: '' }
  res.status = jest.fn((c: number) => { res._status = c; return res })
  res.type   = jest.fn(() => res)
  res.send   = jest.fn((b: string) => { res._body = b; return res })
  return res
}
const req: any = { headers: {}, query: {} }

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.METRICS_TOKEN
  process.env.METRICS_PUBLIC = 'true'   // défaut = fermé ; on ouvre pour tester le rendu
})
afterEach(() => { delete process.env.METRICS_PUBLIC })

describe('GET /metrics — ops gauges', () => {
  it('exposes the silent-failure surfaces (gaps, queue depth, heartbeat, notify fails)', async () => {
    mockRedis.get.mockImplementation(async (k: string) => {
      if (k === 'worker:heartbeat')           return String(Date.now() - 30_000) // 30s ago
      if (k === 'metrics:notify_fail:email')  return '3'
      return null
    })
    mockRedis.llen.mockImplementation(async (k: string) => (k.includes('dlq') ? 2 : 4))

    const res = fakeRes()
    await metricsHandler(req, res)

    const body = res._body as string
    expect(body).toContain('cronguard_analysis_failures_24h 7')
    expect(body).toContain('cronguard_analysis_queue_depth 4')
    expect(body).toContain('cronguard_analysis_dlq_depth 2')
    expect(body).toMatch(/cronguard_worker_heartbeat_age_seconds (2[0-9]|3[0-9])/) // ~30s
    expect(body).toContain('cronguard_notification_failures_total{channel="email"} 3')
    expect(body).toContain('cronguard_notification_failures_total{channel="slack"} 0')
  })

  it('emits the heartbeat sentinel + zeroed counters when Redis is unreachable', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'))
    mockRedis.llen.mockRejectedValue(new Error('redis down'))

    const res = fakeRes()
    await metricsHandler(req, res)

    expect(res._body).toContain('cronguard_worker_heartbeat_age_seconds 999999')
    expect(res._body).toContain('cronguard_analysis_queue_depth 0')
    expect(res._body).toContain('cronguard_notification_failures_total{channel="webhook"} 0')
  })

  it('401s when METRICS_TOKEN is set and the token is wrong', async () => {
    process.env.METRICS_TOKEN = 'secret-token'
    const res = fakeRes()
    await metricsHandler({ headers: {}, query: {} } as any, res)
    expect(res._status).toBe(401)
  })

  it('is closed by default — 401 when neither token nor METRICS_PUBLIC is set', async () => {
    delete process.env.METRICS_TOKEN
    delete process.env.METRICS_PUBLIC
    const res = fakeRes()
    await metricsHandler({ headers: {}, query: {} } as any, res)
    expect(res._status).toBe(401)
  })
})
