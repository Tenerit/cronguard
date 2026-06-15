import request from 'supertest'
import express from 'express'
import { clientsRouter } from '../api/routes/clients'
import { teamRouter }    from '../api/routes/team'

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
