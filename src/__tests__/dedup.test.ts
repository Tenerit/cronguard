import { shouldAlert, clearAlert, acknowledgeAlert, snoozeAlert } from '../services/alerts/dedup'

// ─── Mock DB ──────────────────────────────────────────────────────────────────

const store: Record<string, any> = {}

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      const monitorId = params[0]

      // INSERT alert_states
      if (sql.includes('INSERT INTO alert_states') && sql.includes('alert_count')) {
        store[monitorId] = {
          status: 'firing', alert_count: 1,
          first_fired: new Date(), last_alerted: new Date(), snooze_until: null,
        }
        return { rows: [] }
      }
      // INSERT acknowledged
      if (sql.includes("'acknowledged'")) {
        store[monitorId] = { ...(store[monitorId] || {}), status: 'acknowledged' }
        return { rows: [] }
      }
      // INSERT snoozed
      if (sql.includes("'snoozed'")) {
        store[monitorId] = { ...(store[monitorId] || {}), status: 'snoozed', snooze_until: params[1] }
        return { rows: [] }
      }
      // UPDATE firing
      if (sql.includes('SET last_alerted') && sql.includes('alert_count + 1')) {
        if (store[monitorId]) {
          store[monitorId].alert_count = (store[monitorId].alert_count || 1) + 1
          store[monitorId].last_alerted = new Date()
        }
        return { rows: [store[monitorId] || {}] }
      }
      // SELECT
      if (sql.includes('SELECT *')) {
        return { rows: store[monitorId] ? [store[monitorId]] : [] }
      }
      // DELETE
      if (sql.includes('DELETE FROM alert_states')) {
        delete store[monitorId]
        return { rows: [] }
      }
      return { rows: [] }
    }),
  },
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  jest.clearAllMocks()
})

describe('shouldAlert', () => {

  it('sends alert on first failure (isNew=true)', async () => {
    const result = await shouldAlert('monitor-1')
    expect(result.decision).toBe('send')
    expect(result.isNew).toBe(true)
    expect(result.alertCount).toBe(1)
  })

  it('skips alert during cooldown', async () => {
    // First alert fires
    await shouldAlert('monitor-2')
    // Second call immediately → cooldown active
    const result = await shouldAlert('monitor-2')
    expect(result.decision).toBe('skip')
    expect(result.isNew).toBe(false)
  })

  it('sends repeat alert after cooldown has passed', async () => {
    // Simulate a last_alerted in the past (> cooldown)
    store['monitor-3'] = {
      status: 'firing', alert_count: 1,
      first_fired: new Date(Date.now() - 40 * 60000),
      last_alerted: new Date(Date.now() - 35 * 60000), // 35min ago
      snooze_until: null,
    }
    const result = await shouldAlert('monitor-3', 30) // 30min cooldown
    expect(result.decision).toBe('send')
    expect(result.alertCount).toBe(2)
  })

  it('suppresses alert when acknowledged', async () => {
    await acknowledgeAlert('monitor-4')
    const result = await shouldAlert('monitor-4')
    expect(result.decision).toBe('acknowledged')
  })

  it('suppresses alert during snooze', async () => {
    const future = new Date(Date.now() + 30 * 60000) // 30min from now
    store['monitor-5'] = {
      status: 'snoozed', alert_count: 1,
      first_fired: new Date(), last_alerted: new Date(),
      snooze_until: future,
    }
    const result = await shouldAlert('monitor-5')
    expect(result.decision).toBe('snoozed')
  })

  it('sends alert after snooze expires', async () => {
    const past = new Date(Date.now() - 5 * 60000) // expired 5min ago
    store['monitor-6'] = {
      status: 'snoozed', alert_count: 1,
      first_fired: new Date(), last_alerted: new Date(Date.now() - 40 * 60000),
      snooze_until: past,
    }
    const result = await shouldAlert('monitor-6', 30)
    expect(result.decision).toBe('send')
  })
})

describe('clearAlert', () => {
  it('removes alert state on success', async () => {
    store['monitor-7'] = { status: 'firing', alert_count: 3 }
    await clearAlert('monitor-7')
    expect(store['monitor-7']).toBeUndefined()
  })
})

describe('acknowledgeAlert', () => {
  it('sets status to acknowledged', async () => {
    await acknowledgeAlert('monitor-8')
    expect(store['monitor-8']?.status).toBe('acknowledged')
  })
})

describe('snoozeAlert', () => {
  it('sets status to snoozed with future date', async () => {
    await snoozeAlert('monitor-9', 60)
    expect(store['monitor-9']?.status).toBe('snoozed')
    expect(new Date(store['monitor-9']?.snooze_until).getTime()).toBeGreaterThan(Date.now())
  })
})
