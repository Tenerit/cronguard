import { isOpen, onSuccess, onFailure } from '../services/llm/circuit-breaker'

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const store: Record<string, string> = {}

jest.mock('../config/redis', () => ({
  redis: {
    get:    jest.fn(async (k: string)            => store[k] ?? null),
    set:    jest.fn(async (k: string, v: string) => { store[k] = v; return 'OK' }),
    del:    jest.fn(async (k: string)            => { delete store[k]; return 1 }),
    incr:   jest.fn(async (k: string)            => { store[k] = String((parseInt(store[k] ?? '0') + 1)); return parseInt(store[k]) }),
    expire: jest.fn(async ()                     => 1),
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearStore() { Object.keys(store).forEach(k => delete store[k]) }

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => { clearStore(); jest.clearAllMocks() })

describe('isOpen()', () => {
  it('returns false when no key in Redis', async () => {
    expect(await isOpen()).toBe(false)
  })

  it('returns true when circuit is open and within reset window', async () => {
    store['llm:circuit_breaker'] = String(Date.now() - 10_000) // opened 10s ago
    expect(await isOpen()).toBe(true)
  })

  it('auto-resets and returns false after RESET_MS (60s)', async () => {
    store['llm:circuit_breaker'] = String(Date.now() - 61_000) // opened 61s ago
    const result = await isOpen()
    expect(result).toBe(false)
    expect(store['llm:circuit_breaker']).toBeUndefined()
  })
})

describe('onSuccess()', () => {
  it('resets failure counter to 0', async () => {
    store['llm:circuit_fails'] = '3'
    await onSuccess()
    expect(store['llm:circuit_fails']).toBe('0')
  })
})

describe('onFailure()', () => {
  it('increments failure counter', async () => {
    await onFailure()
    expect(parseInt(store['llm:circuit_fails'])).toBe(1)
  })

  it('does not open circuit below threshold (5)', async () => {
    for (let i = 0; i < 4; i++) await onFailure()
    expect(store['llm:circuit_breaker']).toBeUndefined()
  })

  it('opens circuit exactly at threshold (5)', async () => {
    for (let i = 0; i < 5; i++) await onFailure()
    expect(store['llm:circuit_breaker']).toBeDefined()
    expect(parseInt(store['llm:circuit_breaker']!)).toBeCloseTo(Date.now(), -3)
  })

  it('full cycle: fail × 5 → open → reset after 60s → closed', async () => {
    // Open
    for (let i = 0; i < 5; i++) await onFailure()
    expect(await isOpen()).toBe(true)

    // Reset by backdating
    store['llm:circuit_breaker'] = String(Date.now() - 61_000)
    expect(await isOpen()).toBe(false)

    // After reset, new failures work again
    await onFailure()
    expect(parseInt(store['llm:circuit_fails'])).toBe(1)
  })
})
