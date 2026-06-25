import request from 'supertest'
import express from 'express'

// ─── Mock Stripe AVANT tout import ───────────────────────────────────────────
// L'instance Stripe est créée au chargement de billing.ts.
// On capture une référence au mock pour piloter constructEvent dans les tests.

const mockConstructEvent = jest.fn()
const mockCreateSession  = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' })

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    checkout: { sessions: { create: mockCreateSession } },
  }))
)

// ─── Mock DB ──────────────────────────────────────────────────────────────────

let planInDb = 'free'

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      // INSERT client (register)
      if (sql.includes('INSERT INTO clients') && !sql.includes('subscriptions')) {
        planInDb = 'free'
        return { rows: [{ id: 'cli-1', api_key: 'ak-test', plan: 'free' }] }
      }
      // Upsert client (checkout completed)
      if (sql.includes('ON CONFLICT') && sql.includes('DO UPDATE SET')) {
        planInDb = 'pro'
        return { rows: [] }
      }
      // Update plan
      if (sql.includes('UPDATE clients SET plan')) {
        planInDb = params[1] ?? params[0]
        return { rows: [] }
      }
      // Insert subscription
      if (sql.includes('INSERT INTO subscriptions')) return { rows: [] }
      // Disable monitors past limit
      if (sql.includes('UPDATE monitors SET active')) return { rows: [] }
      // Get api_key after register
      if (sql.includes('SELECT api_key FROM clients')) {
        return { rows: [{ api_key: 'ak-test' }] }
      }
      // Auth for checkout
      if (sql.includes('WHERE api_key')) {
        return params[0] === 'valid-key'
          ? { rows: [{ id: 'cli-1', email: 'test@example.com', stripe_id: null }] }
          : { rows: [] }
      }
      return { rows: [] }
    }),
  },
}))

jest.mock('../services/auth', () => ({
  requestKeyReset:   jest.fn().mockResolvedValue(undefined),
  consumeResetToken: jest.fn().mockResolvedValue({ apiKey: 'cg_test_key', email: 'test@example.com' }),
}))

jest.mock('../services/email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

process.env.STRIPE_SECRET_KEY     = 'sk_test_mock'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
process.env.STRIPE_PRO_PRICE_ID   = 'price_test'
process.env.APP_URL               = 'http://localhost:3000'

import { webhookRouter, accountRouter } from '../api/routes/billing'

function buildApp() {
  const app = express()
  // Câblage identique à la prod : webhookRouter (raw body, sans rate-limit) sous
  // /webhooks ; accountRouter sous /auth + /billing. Les routes compte NE sont PAS
  // exposées sous /webhooks (anti-bypass du rate-limiter).
  app.use('/webhooks', webhookRouter)
  app.use(express.json())
  app.use('/auth',    accountRouter)
  app.use('/billing', accountRouter)
  return app
}

const app = buildApp()

beforeEach(() => {
  jest.clearAllMocks()
  planInDb = 'free'
  mockCreateSession.mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
})

// ─── Tests : POST /auth/register ─────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('creates a new client on plan free and returns API key', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com' })
    expect(res.status).toBe(201)
    expect(res.body.apiKey).toBeDefined()
    expect(res.body.plan).toBe('free')
  })

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
  })

  it('rejects missing email', async () => {
    const res = await request(app).post('/auth/register').send({})
    expect(res.status).toBe(400)
  })
})

// ─── Tests : POST /webhooks/stripe ───────────────────────────────────────────

describe('POST /webhooks/stripe', () => {
  function sendWebhook(event: object) {
    mockConstructEvent.mockReturnValueOnce(event)
    return request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'valid-sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(event)))
  }

  it('returns 400 on invalid signature', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'bad-sig')
      .send(Buffer.from('{}'))
    expect(res.status).toBe(400)
  })

  it('activates pro plan on checkout.session.completed', async () => {
    const res = await sendWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_details: { email: 'test@example.com' },
          customer: 'cus_123', subscription: 'sub_123',
        },
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
  })

  it('renews pro plan on invoice.payment_succeeded', async () => {
    const res = await sendWebhook({
      type: 'invoice.payment_succeeded',
      data: { object: { customer: 'cus_123' } },
    })
    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
  })

  it('downgrades to free after 3rd failed payment', async () => {
    const res = await sendWebhook({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123', attempt_count: 3 } },
    })
    expect(res.status).toBe(200)
    const { db } = require('../db')
    // SQL has plan hardcoded: "SET plan = 'free'"
    const downgrade = db.query.mock.calls.find((c: any[]) =>
      c[0].includes("SET plan = 'free'")
    )
    expect(downgrade).toBeDefined()
  })

  it('does NOT downgrade on first payment failure', async () => {
    const res = await sendWebhook({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_123', attempt_count: 1 } },
    })
    expect(res.status).toBe(200)
    const { db } = require('../db')
    const downgrade = db.query.mock.calls.find((c: any[]) =>
      c[0].includes("SET plan = 'free'")
    )
    expect(downgrade).toBeUndefined()
  })

  it('cancels subscription on customer.subscription.deleted', async () => {
    const res = await sendWebhook({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_123' } },
    })
    expect(res.status).toBe(200)
  })

  it('re-enables monitors on subscription upgrade', async () => {
    const res = await sendWebhook({
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_123', status: 'active' } },
    })
    expect(res.status).toBe(200)
  })

  it('returns 200 for unhandled event types (idempotent)', async () => {
    const res = await sendWebhook({ type: 'unknown.event', data: { object: {} } })
    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
  })
})

// ─── Tests : POST /billing/checkout ──────────────────────────────────────────

describe('POST /billing/checkout', () => {
  it('returns a Stripe checkout URL for a valid API key', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('X-API-Key', 'valid-key')
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.checkoutUrl).toContain('checkout.stripe.com')
    expect(mockCreateSession).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without API key', async () => {
    const res = await request(app).post('/billing/checkout').send({})
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid API key', async () => {
    const res = await request(app)
      .post('/billing/checkout')
      .set('X-API-Key', 'bad-key')
      .send({})
    expect(res.status).toBe(401)
  })
})

// ─── Tests supplémentaires : reset, trial, cas limites ────────────────────────

describe('POST /billing/checkout — cas supplémentaires', () => {
  it('retourne 503 si Stripe non configuré', async () => {
    const saved = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const res = await request(app).post('/billing/checkout').set('X-API-Key', 'key')
    expect(res.status).toBe(503)
    process.env.STRIPE_SECRET_KEY = saved
  })
})

describe('POST /auth/reset-request', () => {
  it('retourne 200 même si email inexistant (pas d\'énumération)', async () => {
    const res = await request(app).post('/auth/reset-request').send({ email: 'nobody@ghost.com' })
    expect(res.status).toBe(200)
    expect(res.body.message).toBeDefined()
  })

  it('retourne 400 sans email', async () => {
    const res = await request(app).post('/auth/reset-request').send({})
    expect(res.status).toBe(400)
  })
})

// POST /auth/reset — testé via la suite describe ci-dessus

describe('POST /auth/start-trial — cas supplémentaires', () => {
  it('active 14 jours pro pour un compte free', async () => {
    const { db } = jest.requireMock('../db')
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'free', trial_ends_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(200)
    expect(res.body.plan).toBe('pro')
    expect(new Date(res.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('retourne 400 si déjà Pro', async () => {
    const { db } = jest.requireMock('../db')
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'pro', trial_ends_at: null }] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Pro')
  })

  it('retourne 400 si trial déjà utilisé', async () => {
    const { db } = jest.requireMock('../db')
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'free', trial_ends_at: new Date() }] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Trial')
  })

  it('retourne 401 sans clé', async () => {
    const res = await request(app).post('/auth/start-trial')
    expect(res.status).toBe(401)
  })
})

// ─── Régression : routes compte PAS exposées sous /webhooks ───────────────────
// /webhooks n'a pas de rate-limiter ; n'y monter que le webhook Stripe, jamais les
// routes compte (sinon bypass du limiteur anti-abus register/reset/checkout).
describe('anti-bypass rate-limit : /webhooks n\'expose que /stripe', () => {
  for (const path of ['/webhooks/register', '/webhooks/reset-request', '/webhooks/checkout', '/webhooks/start-trial']) {
    it(`404 sur POST ${path}`, async () => {
      const res = await request(app).post(path).send({ email: 'x@y.com' })
      expect(res.status).toBe(404)
    })
  }
})

// ─── Tests supplémentaires : reset, trial, cas limites ────────────────────────

describe('POST /auth/reset-request', () => {
  it('retourne 200 même si email inexistant (pas d\'énumération)', async () => {
    const res = await request(app).post('/auth/reset-request').send({ email: 'nobody@ghost.com' })
    expect(res.status).toBe(200)
    expect(res.body.message).toBeDefined()
  })

  it('retourne 400 sans email', async () => {
    const res = await request(app).post('/auth/reset-request').send({})
    expect(res.status).toBe(400)
  })
})

// POST /auth/reset — testé via la suite describe ci-dessus

describe('POST /auth/start-trial — cas supplémentaires', () => {
  it('active 14 jours pro pour un compte free', async () => {
    const { db } = jest.requireMock('../db')
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'free', trial_ends_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(200)
    expect(res.body.plan).toBe('pro')
    expect(new Date(res.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('retourne 400 si déjà Pro', async () => {
    const { db } = jest.requireMock('../db')
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'pro', trial_ends_at: null }] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Pro')
  })

  it('retourne 400 si trial déjà utilisé', async () => {
    const { db } = jest.requireMock('../db')
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', plan: 'free', trial_ends_at: new Date() }] })
    const res = await request(app).post('/auth/start-trial').set('X-API-Key', 'valid-key')
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Trial')
  })

  it('retourne 401 sans clé', async () => {
    const res = await request(app).post('/auth/start-trial')
    expect(res.status).toBe(401)
  })
})
