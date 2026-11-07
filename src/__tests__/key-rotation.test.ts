import request from 'supertest'
import express from 'express'
import { clientsRouter } from '../api/routes/clients'
import { teamRouter }    from '../api/routes/team'
import { getRedis }        from '../config/redis'
import { getAnalysisQueue } from '../queue'

jest.mock('../config/redis', () => ({ getRedis: jest.fn() }))
jest.mock('../queue', () => ({ getAnalysisQueue: jest.fn() }))

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('UPDATE clients SET api_key'))      return { rows: [{ id: 'cli-1' }] }
      if (sql.includes('UPDATE team_members SET api_key')) return { rows: [{ email: 'dev@corp.com' }] }
      if (sql.includes('INSERT INTO audit_logs'))          return { rows: [] }
      return { rows: [] }
    }),
  },
}))

function app(role = 'owner') {
  const a = express()
  a.use(express.json())
  a.use((_req, res, next) => { res.locals.clientId = 'cli-1'; res.locals.role = role; next() })
  a.use('/clients', clientsRouter)
  a.use('/team',    teamRouter)
  return a
}

beforeEach(() => jest.clearAllMocks())

describe('POST /clients/rotate-key', () => {
  it('returns a fresh cg_live_ key for an owner', async () => {
    const res = await request(app('owner')).post('/clients/rotate-key')
    expect(res.status).toBe(200)
    expect(res.body.api_key).toMatch(/^cg_live_[a-f0-9]{32}$/)
  })

  it('rotations produce different keys', async () => {
    const a = app('owner')
    const k1 = (await request(a).post('/clients/rotate-key')).body.api_key
    const k2 = (await request(a).post('/clients/rotate-key')).body.api_key
    expect(k1).not.toBe(k2)
  })

  it("n'écrit en base que l'empreinte, jamais la clé en clair (client et membre)", async () => {
    const { db } = jest.requireMock('../db') as { db: { query: jest.Mock } }
    const { hashApiKey } = jest.requireActual('../services/api-keys')
    for (const path of ['/clients/rotate-key', '/team/members/m-1/rotate-key']) {
      db.query.mockClear()
      const key = (await request(app('owner')).post(path)).body.api_key
      const written = db.query.mock.calls.find(([sql]: [string]) => sql.includes('SET api_key'))![1] as string[]
      expect(written).toContain(hashApiKey(key))
      expect(written).not.toContain(key)
    }
  })

  it('is owner-only (admin → 403)', async () => {
    const res = await request(app('admin')).post('/clients/rotate-key')
    expect(res.status).toBe(403)
  })
})

describe('POST /team/members/:id/rotate-key', () => {
  it('returns the member email + a fresh key for an owner', async () => {
    const res = await request(app('owner')).post('/team/members/m-1/rotate-key')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('dev@corp.com')
    expect(res.body.api_key).toMatch(/^cg_live_[a-f0-9]{32}$/)
  })

  it('is owner-only (member → 403)', async () => {
    const res = await request(app('member')).post('/team/members/m-1/rotate-key')
    expect(res.status).toBe(403)
  })
})

describe('POST /clients/dlq/replay', () => {
  const mine  = JSON.stringify({ at: 1, id: 'j1', name: 'analyze', reason: 'boom', data: { clientId: 'cli-1', jobName: 'backup' } })
  const other = JSON.stringify({ at: 2, id: 'j2', name: 'analyze', reason: 'boom', data: { clientId: 'cli-2', jobName: 'etl' } })

  it('replays only this client\'s failed jobs and keeps other tenants\'', async () => {
    const add = jest.fn(); const del = jest.fn(); const rpush = jest.fn()
    ;(getRedis as jest.Mock).mockReturnValue({ lrange: jest.fn(async () => [mine, other]), del, rpush })
    ;(getAnalysisQueue as jest.Mock).mockReturnValue({ add })

    const res = await request(app('admin')).post('/clients/dlq/replay')
    expect(res.status).toBe(200)
    expect(res.body.replayed).toBe(1)
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith('analyze', expect.objectContaining({ clientId: 'cli-1' }))
    expect(del).toHaveBeenCalledWith('cronguard:dlq:llm-analysis')
    expect(rpush).toHaveBeenCalledWith('cronguard:dlq:llm-analysis', other) // l'autre tenant conservé
  })

  it('is admin+ (member → 403)', async () => {
    ;(getRedis as jest.Mock).mockReturnValue({ lrange: jest.fn(async () => []), del: jest.fn(), rpush: jest.fn() })
    ;(getAnalysisQueue as jest.Mock).mockReturnValue({ add: jest.fn() })
    const res = await request(app('member')).post('/clients/dlq/replay')
    expect(res.status).toBe(403)
  })
})
