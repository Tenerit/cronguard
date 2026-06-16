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
})

describe('GET /metrics — ops gauges', () => {
  it('exposes the silent-failure surfaces (gaps, queue depth, heartbeat age)', async () => {
    mockRedis.get.mockResolvedValueOnce(String(Date.now() - 30_000)) // heartbeat 30s ago
    mockRedis.llen.mockResolvedValueOnce(4)

    const res = fakeRes()
    await metricsHandler(req, res)

    const body = res._body as string
    expect(body).toContain('cronguard_analysis_failures_24h 7')
    expect(body).toContain('cronguard_analysis_queue_depth 4')
    expect(body).toMatch(/cronguard_worker_heartbeat_age_seconds (2[0-9]|3[0-9])/) // ~30s
  })

  it('emits the heartbeat sentinel when Redis is unreachable (dead-man fires)', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('redis down'))
    mockRedis.llen.mockRejectedValueOnce(new Error('redis down'))

    const res = fakeRes()
    await metricsHandler(req, res)

    expect(res._body).toContain('cronguard_worker_heartbeat_age_seconds 999999')
    expect(res._body).toContain('cronguard_analysis_queue_depth 0')
  })

  it('401s when METRICS_TOKEN is set and the token is wrong', async () => {
    process.env.METRICS_TOKEN = 'secret-token'
    const res = fakeRes()
    await metricsHandler({ headers: {}, query: {} } as any, res)
    expect(res._status).toBe(401)
  })
})
