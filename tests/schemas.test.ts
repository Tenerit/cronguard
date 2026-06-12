import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Réplique exacte du schema dans src/api/index.ts
const PingSchema = z.object({
  status:      z.enum(['success', 'fail']),
  duration_ms: z.number().int().positive().max(86_400_000).optional(),
  records:     z.number().int().nonnegative().max(1_000_000_000).optional(),
  exit_code:   z.number().int().min(-999).max(999).optional(),
  output:      z.string().max(4000).optional(),
})

describe('PingSchema validation', () => {

  describe('valid payloads', () => {
    it('accepts minimal success ping', () => {
      const r = PingSchema.safeParse({ status: 'success' })
      expect(r.success).toBe(true)
    })

    it('accepts full success ping', () => {
      const r = PingSchema.safeParse({
        status: 'success', duration_ms: 4521, records: 15230
      })
      expect(r.success).toBe(true)
    })

    it('accepts fail ping with logs', () => {
      const r = PingSchema.safeParse({
        status: 'fail', exit_code: 1, output: 'ERROR: connection timeout'
      })
      expect(r.success).toBe(true)
    })

    it('accepts 0 records (empty run)', () => {
      const r = PingSchema.safeParse({ status: 'success', records: 0 })
      expect(r.success).toBe(true)
    })
  })

  describe('invalid payloads', () => {
    it('rejects empty body', () => {
      expect(PingSchema.safeParse({}).success).toBe(false)
    })

    it('rejects unknown status', () => {
      expect(PingSchema.safeParse({ status: 'ok' }).success).toBe(false)
      expect(PingSchema.safeParse({ status: 'admin' }).success).toBe(false)
    })

    it('rejects negative records', () => {
      expect(PingSchema.safeParse({ status: 'success', records: -1 }).success).toBe(false)
    })

    it('rejects duration_ms over 24h', () => {
      expect(PingSchema.safeParse({ status: 'success', duration_ms: 86_400_001 }).success).toBe(false)
    })

    it('rejects absurd duration (999 billion ms)', () => {
      expect(PingSchema.safeParse({ status: 'success', duration_ms: 999_999_999_999 }).success).toBe(false)
    })

    it('rejects output over 4000 chars', () => {
      expect(PingSchema.safeParse({
        status: 'fail', output: 'A'.repeat(4001)
      }).success).toBe(false)
    })

    it('rejects exit_code out of range', () => {
      expect(PingSchema.safeParse({ status: 'fail', exit_code: 9999 }).success).toBe(false)
      expect(PingSchema.safeParse({ status: 'fail', exit_code: -9999 }).success).toBe(false)
    })
  })

  describe('output validation logic', () => {
    it('detects silent failure: exit 0 but records out of range', () => {
      const parsed = PingSchema.parse({ status: 'success', records: 0 })
      const expectedMin = 100
      const expectedMax = 50_000

      let status = parsed.status
      if (
        status === 'success' &&
        parsed.records !== undefined &&
        (parsed.records < expectedMin || parsed.records > expectedMax)
      ) {
        status = 'fail'
      }

      expect(status).toBe('fail')
    })

    it('passes when records within expected range', () => {
      const parsed = PingSchema.parse({ status: 'success', records: 1500 })
      let status = parsed.status
      const min = 100, max = 50_000

      if (status === 'success' && parsed.records !== undefined &&
          (parsed.records < min || parsed.records > max)) {
        status = 'fail'
      }

      expect(status).toBe('success')
    })
  })
})

describe('MonitorSchema validation', () => {
  const MonitorSchema = z.object({
    name:         z.string().min(1).max(100),
    schedule:     z.string().optional(),
    grace_period: z.number().int().min(60).max(86400).default(300),
    expected_min: z.number().int().nonnegative().optional(),
    expected_max: z.number().int().nonnegative().optional(),
    env:          z.enum(['development','staging','production']).default('production'),
  })

  it('accepts minimal monitor', () => {
    const r = MonitorSchema.safeParse({ name: 'backup-job' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.env).toBe('production')
      expect(r.data.grace_period).toBe(300)
    }
  })

  it('rejects empty name', () => {
    expect(MonitorSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name over 100 chars', () => {
    expect(MonitorSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('rejects grace_period below 60s', () => {
    expect(MonitorSchema.safeParse({ name: 'job', grace_period: 10 }).success).toBe(false)
  })

  it('rejects unknown env', () => {
    expect(MonitorSchema.safeParse({ name: 'job', env: 'preprod' }).success).toBe(false)
  })
})
