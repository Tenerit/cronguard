/**
 * Tests du ping endpoint — route la plus critique du produit.
 * C'est la seule route appelée par les scripts des clients.
 */

import request from 'supertest'
import express from 'express'
import { pingRouter } from '../api/routes/ping'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn()
jest.mock('../db', () => ({ db: { query: (...a: unknown[]) => mockQuery(...a) } }))

const mockQueueAdd = jest.fn().mockResolvedValue({ id: '1' })
jest.mock('../queue', () => ({
  pingQueue: { add: (...a: unknown[]) => mockQueueAdd(...a) }
}))

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use('/ping', pingRouter)
app.use((err: Error, _req: any, res: any, _next: any) =>
  res.status(500).json({ error: err.message })
)

const PING_KEY = 'test-ping-key-123'

const mockMonitor = {
  id: 'mon-1', client_id: 'cli-1',
  active: true, expected_min: null, expected_max: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockResolvedValue({ rows: [mockMonitor] })
})

// ─── Validation du payload ────────────────────────────────────────────────────

describe('POST /ping/:pingKey — validation payload', () => {
  it('accepte status=success → 200', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', duration_ms: 1200, records: 5000 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('accepte status=fail → 200', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'fail', exit_code: 1, output: 'Error: connection refused' })
    expect(res.status).toBe(200)
  })

  it('rejette status invalide → 400', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'running' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid payload')
  })

  it('rejette sans status → 400', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ duration_ms: 1200 })
    expect(res.status).toBe(400)
  })

  it('rejette duration_ms négatif → 400', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', duration_ms: -100 })
    expect(res.status).toBe(400)
  })

  it('rejette duration_ms > 24h → 400', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', duration_ms: 90_000_000 })
    expect(res.status).toBe(400)
  })

  it('rejette output > 4000 chars → 400', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'fail', output: 'x'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('accepte records=0 (output validation) → 200', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', records: 0 })
    expect(res.status).toBe(200)
  })
})

// ─── Logique métier ───────────────────────────────────────────────────────────

describe('POST /ping/:pingKey — logique', () => {
  it('retourne 404 pour une ping_key inconnue', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).post('/ping/unknown-key').send({ status: 'success' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Monitor not found')
  })

  it('retourne ok:true skipped:true si monitor en pause', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...mockMonitor, active: false }] })
    const res = await request(app).post(`/ping/${PING_KEY}`).send({ status: 'success' })
    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it('output validation : success + 0 records → reclassifié fail', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      ...mockMonitor, expected_min: 100, expected_max: 50000
    }]})
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', records: 0 })
    expect(res.status).toBe(200)
    // Le job doit être enqueué avec status=fail
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'ping',
      expect.objectContaining({ status: 'fail' })
    )
  })

  it('success normal → enqueue avec status=success', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'success', duration_ms: 1500, records: 5000 })
    expect(res.status).toBe(200)
    expect(mockQueueAdd).toHaveBeenCalledWith('ping', expect.objectContaining({
      status: 'success',
      durationMs: 1500,
      records: 5000,
    }))
  })

  it('fail → enqueue avec exit_code et output', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`)
      .send({ status: 'fail', exit_code: 2, output: 'FATAL: DB connection refused' })
    expect(res.status).toBe(200)
    expect(mockQueueAdd).toHaveBeenCalledWith('ping', expect.objectContaining({
      status: 'fail',
      exitCode: 2,
      output: 'FATAL: DB connection refused',
    }))
  })

  it('script du job : seuls les risques entrent dans la file, jamais son texte', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`).send({ status: 'fail', exit_code: 1, output: 'the input device is not a TTY',
      context: { script: { path: '/opt/renew.sh', text: '#!/bin/bash\ndocker run -ti certbot renew\n' } } })
    expect(res.status).toBe(200)
    const job = mockQueueAdd.mock.calls.at(-1)[1]
    expect(job.runContext.script).toEqual({ path: '/opt/renew.sh', risks: ['script-docker-tty'] })
    expect(JSON.stringify(job)).not.toContain('certbot')
  })

  it('répond en < 50ms (ping doit être ultra-rapide)', async () => {
    const start = Date.now()
    await request(app).post(`/ping/${PING_KEY}`).send({ status: 'success' })
    expect(Date.now() - start).toBeLessThan(50)
  })
})

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe('POST /ping/:pingKey — rate limiting', () => {
  it('headers de rate limit présents', async () => {
    const res = await request(app).post(`/ping/${PING_KEY}`).send({ status: 'success' })
    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']).toBeDefined()
  })
})
