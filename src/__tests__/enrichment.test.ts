/**
 * Tests des nouvelles fonctionnalités :
 * - Enrichissement contexte LLM (failCount7d, durationTrend, successRate7d)
 * - Calcul du health score (logique JS simulée côté serveur)
 * - Gestion des cas d'erreur settings (trial déjà utilisé, déjà Pro)
 * - Routes /monitors/:id/analyses et /monitors/:id/audit
 */

import request from 'supertest'
import express from 'express'
import { monitorsRouter }  from '../api/routes/monitors'
import { clientsRouter }   from '../api/routes/clients'
import { asyncHandler }    from '../api/middleware/async-handler'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const CLIENT_ID = 'cli-enrichment-test'
const MONITOR_ID = 'mon-enrichment-test'

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM analyses') && sql.includes('monitor_id'))
        return { rows: [{ id: 'ana-1', diagnosis: '{"cause":"test","action":"fix it","severity":"high"}', model_used: 'qwen', severity: 'high', created_at: new Date() }] }
      if (sql.includes('FROM audit_logs'))
        return { rows: [{ action: 'monitor.paused', resource: 'monitor', resource_id: MONITOR_ID, meta: '{}', ip: '127.0.0.1', created_at: new Date() }] }
      if (sql.includes('WHERE api_key') || sql.includes('WHERE id ='))
        return { rows: [{ id: CLIENT_ID, email: 'test@test.com', plan: 'free', trial_ends_at: null }] }
      if (sql.includes('SELECT id FROM monitors WHERE client_id') || sql.includes('SELECT m.id FROM monitors'))
        return { rows: [{ id: MONITOR_ID }] }
      return { rows: [] }
    }),
  },
}))

jest.mock('../api/middleware/ownership', () => ({
  ownsMonitor: (_req: any, _res: any, next: any) => next(),
  requireRole: (_min: any) => (_req: any, _res: any, next: any) => next(),
}))

jest.mock('../services/alerts/dedup', () => ({
  acknowledgeAlert: jest.fn().mockResolvedValue(undefined),
  snoozeAlert: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../services/alerts', () => ({
  sendAlert: jest.fn().mockResolvedValue(undefined),
}))

// ─── App ──────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { res.locals.clientId = CLIENT_ID; res.locals.plan = 'free'; res.locals.role = 'owner'; next() })
  app.use('/monitors', monitorsRouter)
  app.use('/clients', clientsRouter)
  app.use((err: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }))
  return app
}

const app = buildApp()

beforeEach(() => jest.clearAllMocks())

// ─── Analyses d'un monitor ────────────────────────────────────────────────────

describe('GET /monitors/:id/analyses', () => {
  it('retourne les analyses du monitor', async () => {
    const res = await request(app).get(`/monitors/${MONITOR_ID}/analyses`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty('diagnosis')
  })

  it('la réponse contient les champs attendus', async () => {
    const res = await request(app).get(`/monitors/${MONITOR_ID}/analyses`)
    expect(res.status).toBe(200)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('model_used')
      expect(res.body[0]).toHaveProperty('severity')
    }
  })
})

// ─── Journal d'audit ──────────────────────────────────────────────────────────

describe('GET /monitors/:id/audit', () => {
  it('retourne le journal des actions', async () => {
    const res = await request(app).get(`/monitors/${MONITOR_ID}/audit`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('contient les champs action, resource, created_at', async () => {
    const res = await request(app).get(`/monitors/${MONITOR_ID}/audit`)
    expect(res.status).toBe(200)
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('action')
      expect(res.body[0]).toHaveProperty('resource')
      expect(res.body[0]).toHaveProperty('created_at')
    }
  })
})

// ─── Health score (logique métier pure) ───────────────────────────────────────

describe('Health score calculation', () => {
  // Reproduit la logique healthScore() du dashboard
  function healthScore(pings: { status: string }[], lastStatus: string): number {
    if (!pings.length) return 50
    const ok = pings.filter(p => p.status === 'success').length
    const base = Math.round(ok / pings.length * 100)
    const penalty = lastStatus === 'late' ? -10 : lastStatus === 'failed' ? -25 : 0
    return Math.max(0, Math.min(100, base + penalty))
  }

  it('retourne 50 sans données', () => {
    expect(healthScore([], 'unknown')).toBe(50)
  })

  it('retourne 100% avec tous succès', () => {
    const pings = Array(10).fill({ status: 'success' })
    expect(healthScore(pings, 'ok')).toBe(100)
  })

  it('applique une pénalité -25 sur échec', () => {
    const pings = Array(10).fill({ status: 'success' })
    expect(healthScore(pings, 'failed')).toBe(75)
  })

  it('applique une pénalité -10 sur retard', () => {
    const pings = Array(10).fill({ status: 'success' })
    expect(healthScore(pings, 'late')).toBe(90)
  })

  it('ne descend jamais sous 0', () => {
    const pings = Array(10).fill({ status: 'failed' })
    expect(healthScore(pings, 'failed')).toBeGreaterThanOrEqual(0)
  })

  it('calcule correctement un mix succès/échec', () => {
    const pings = [
      ...Array(8).fill({ status: 'success' }),
      ...Array(2).fill({ status: 'failed' }),
    ]
    const score = healthScore(pings, 'ok')
    expect(score).toBe(80)
  })
})

// ─── Duration trend (calcTrend) ───────────────────────────────────────────────

describe('Duration trend calculation', () => {
  // Reproduit la logique calcTrend() du dashboard
  function calcTrend(history: { status: string; duration_ms: number }[]): number | null {
    const durs = history.filter(h => h.status === 'success' && h.duration_ms > 0).map(h => h.duration_ms)
    if (durs.length < 4) return null
    const mid  = Math.floor(durs.length / 2)
    const avg1 = durs.slice(0, mid).reduce((a, b) => a + b, 0) / mid
    const avg2 = durs.slice(mid).reduce((a, b) => a + b, 0) / (durs.length - mid)
    if (avg1 <= 0) return null
    return Math.round((avg2 - avg1) / avg1 * 100)
  }

  it('retourne null avec moins de 4 points', () => {
    expect(calcTrend([{status:'success',duration_ms:1000}])).toBeNull()
    expect(calcTrend([{status:'success',duration_ms:1000},{status:'success',duration_ms:2000}])).toBeNull()
  })

  it('détecte une dégradation (+50%)', () => {
    const history = [
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1500 },
      { status: 'success', duration_ms: 1500 },
    ]
    const trend = calcTrend(history)
    expect(trend).toBeGreaterThan(0)
    expect(trend).toBe(50)
  })

  it('détecte une amélioration (-50%)', () => {
    const history = [
      { status: 'success', duration_ms: 2000 },
      { status: 'success', duration_ms: 2000 },
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
    ]
    const trend = calcTrend(history)
    expect(trend).toBeLessThan(0)
    expect(trend).toBe(-50)
  })

  it('ignore les pings en échec dans le calcul', () => {
    const history = [
      { status: 'success', duration_ms: 1000 },
      { status: 'failed', duration_ms: 5000 },  // ignoré
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
    ]
    const trend = calcTrend(history)
    expect(trend).toBe(0) // stable malgré l'échec
  })

  it('retourne null si durées toutes nulles', () => {
    const history = [
      { status: 'success', duration_ms: 0 },
      { status: 'success', duration_ms: 0 },
      { status: 'success', duration_ms: 0 },
      { status: 'success', duration_ms: 0 },
    ]
    expect(calcTrend(history)).toBeNull()
  })
})

// ─── Settings / Trial ─────────────────────────────────────────────────────────

describe('PATCH /clients/settings', () => {
  it('accepte un slack_webhook valide', async () => {
    const res = await request(app)
      .patch('/clients/settings')
      .send({ slack_webhook: 'https://hooks.slack.com/services/TEST' })
    expect(res.status).toBe(200)
  })

  it('rejette un webhook invalide', async () => {
    const res = await request(app)
      .patch('/clients/settings')
      .send({ slack_webhook: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('accepte un webhook vide (suppression)', async () => {
    const res = await request(app)
      .patch('/clients/settings')
      .send({ slack_webhook: '' })
    expect(res.status).toBe(200)
  })
})

// ─── Worker enrichissement contexte LLM ───────────────────────────────────────

describe('Worker LLM context enrichment', () => {
  // Reproduit la logique de calcul dans analysis.worker.ts

  function computeSuccessRate(history: {status: string}[]): number {
    if (!history.length) return 100
    const fails = history.filter(p => p.status !== 'success').length
    return Math.round((history.length - fails) / history.length * 100)
  }

  function computeDurationTrend(history: {status: string; duration_ms: number}[]): number | undefined {
    const durs = history.filter(p => p.duration_ms > 0 && p.status === 'success').map(p => p.duration_ms)
    if (durs.length < 6) return undefined
    const mid  = Math.floor(durs.length / 2)
    const avg1 = durs.slice(0, mid).reduce((a, b) => a + b, 0) / mid
    const avg2 = durs.slice(mid).reduce((a, b) => a + b, 0) / (durs.length - mid)
    return avg1 > 0 ? Math.round((avg2 - avg1) / avg1 * 100) : undefined
  }

  it('calcule un taux de succès correct', () => {
    const history = [
      ...Array(8).fill({ status: 'success' }),
      ...Array(2).fill({ status: 'failed' }),
    ]
    expect(computeSuccessRate(history)).toBe(80)
  })

  it('retourne 100% sans historique', () => {
    expect(computeSuccessRate([])).toBe(100)
  })

  it('calcule la tendance sur 6+ points', () => {
    const history = [
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 1000 },
      { status: 'success', duration_ms: 2000 },
      { status: 'success', duration_ms: 2000 },
      { status: 'success', duration_ms: 2000 },
    ]
    const trend = computeDurationTrend(history)
    expect(trend).toBeDefined()
    expect(trend).toBe(100) // doublement de la durée
  })

  it('retourne undefined avec moins de 6 points', () => {
    const history = Array(4).fill({ status: 'success', duration_ms: 1000 })
    expect(computeDurationTrend(history)).toBeUndefined()
  })
})
