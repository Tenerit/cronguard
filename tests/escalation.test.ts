/**
 * Tests escalade (#6) — logique pure, sans DB.
 * Vérifie : délai, état escalated_at, canaux, format payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockQuery = vi.fn()
vi.mock('../src/db', () => ({ db: { query: (...a: unknown[]) => mockQuery(...a) } }))
vi.mock('../src/config/logger', () => ({ logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { checkEscalations } from '../src/services/alerts/dedup'

const NOW = new Date('2026-06-13T10:00:00Z')

function makeRow(overrides: Partial<{
  monitor_id: string
  client_id: string
  job_name: string
  env: string
  first_fired: Date
  alert_count: number
  escalation_email: string | null
  escalation_webhook: string | null
  escalation_after_min: number
  last_analysis: null
}> = {}) {
  return {
    monitor_id:          'mon-1',
    client_id:           'cli-1',
    job_name:            'backup-postgres',
    env:                 'production',
    first_fired:         new Date(NOW.getTime() - 45 * 60_000), // 45 min ago
    alert_count:         3,
    escalation_email:    'oncall@acme.com',
    escalation_webhook:  null,
    escalation_after_min: 30,
    last_analysis:       null,
    ...overrides,
  }
}

beforeEach(() => { mockQuery.mockReset() })

describe('checkEscalations', () => {
  it('returns empty when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const result = await checkEscalations()
    expect(result).toHaveLength(0)
    // No UPDATE call when nothing to escalate
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('returns escalation targets and marks escalated_at', async () => {
    const row = makeRow()
    mockQuery.mockResolvedValueOnce({ rows: [row] })   // SELECT
    mockQuery.mockResolvedValueOnce({ rows: [] })       // UPDATE

    const result = await checkEscalations()
    expect(result).toHaveLength(1)
    expect(result[0].jobName).toBe('backup-postgres')
    expect(result[0].escalationEmail).toBe('oncall@acme.com')
    expect(result[0].escalationWebhook).toBeNull()
    expect(result[0].alertCount).toBe(3)

    // UPDATE must be called with the monitor id
    const updateCall = mockQuery.mock.calls[1]
    expect(updateCall[0]).toMatch(/UPDATE alert_states SET escalated_at/)
    expect(updateCall[1][0]).toContain('mon-1')
  })

  it('maps multiple targets correctly', async () => {
    const rows = [
      makeRow({ monitor_id: 'mon-1', job_name: 'job-a' }),
      makeRow({ monitor_id: 'mon-2', job_name: 'job-b', escalation_email: null, escalation_webhook: 'https://hooks.example.com' }),
    ]
    mockQuery.mockResolvedValueOnce({ rows })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await checkEscalations()
    expect(result).toHaveLength(2)
    expect(result[0].jobName).toBe('job-a')
    expect(result[1].jobName).toBe('job-b')
    expect(result[1].escalationWebhook).toBe('https://hooks.example.com')

    // Both ids passed to UPDATE
    const ids = mockQuery.mock.calls[1][1][0] as string[]
    expect(ids).toContain('mon-1')
    expect(ids).toContain('mon-2')
  })

  it('maps last_analysis typed columns when present', async () => {
    // v16: the analysis comes back as typed columns (cause/action/category/severity),
    // not a JSON `diagnosis` blob — the SQL builds the object directly.
    const row = makeRow({
      last_analysis: { cause: 'disk full', action: 'purge old backups', category: 'resources', severity: 'critical' } as never,
    })
    mockQuery.mockResolvedValueOnce({ rows: [row] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await checkEscalations()
    expect(result[0].lastAnalysis).not.toBeNull()
    expect(result[0].lastAnalysis?.cause).toBe('disk full')
    expect(result[0].lastAnalysis?.severity).toBe('critical')
  })

  it('returns null lastAnalysis when there is no analysis', async () => {
    const row = makeRow({ last_analysis: null })
    mockQuery.mockResolvedValueOnce({ rows: [row] })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await checkEscalations()
    expect(result[0].lastAnalysis).toBeNull()
  })
})
