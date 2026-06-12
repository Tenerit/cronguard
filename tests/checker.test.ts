import { describe, it, expect } from 'vitest'
import { CronExpressionParser } from 'cron-parser'

// ─── Détection de retard cron-aware (miroir de isLate dans timeout.checker) ───
interface LateRow { schedule?: string; grace_period?: number; last_ping_at?: Date | null; created_at?: Date }
function isLate(m: LateRow, now: number): boolean {
  const graceMs  = (m.grace_period ?? 300) * 1000
  const lastPing = m.last_ping_at ? m.last_ping_at.getTime() : null
  const base     = lastPing ?? (m.created_at ? m.created_at.getTime() : now)
  if (m.schedule) {
    try {
      const due = CronExpressionParser.parse(m.schedule, { currentDate: new Date(base) }).next().toDate().getTime()
      return now > due + graceMs
    } catch { /* fallback */ }
  }
  return base < now - graceMs
}

// ─── Logique pure du checker (sans DB) ───────────────────────────────────────
// Teste les fonctions de construction de logs et de détection d'anomalie

function buildLateLogs(monitor: {
  name: string
  last_ping_at: Date | null
  grace_period: number
  schedule?: string
  avg_duration_7d?: number
}): string {
  const lastPing = monitor.last_ping_at
    ? `il y a ${Math.round((Date.now() - monitor.last_ping_at.getTime()) / 60000)} minutes`
    : 'jamais'

  return [
    `TIMEOUT: Le job "${monitor.name}" n'a pas pingé dans sa fenêtre.`,
    `Dernier ping reçu : ${lastPing}`,
    `Grace period configurée : ${monitor.grace_period}s`,
    monitor.schedule ? `Planning attendu : ${monitor.schedule}` : '',
    monitor.avg_duration_7d
      ? `Durée habituelle : ${Math.round(monitor.avg_duration_7d)}ms`
      : '',
  ].filter(Boolean).join('\n')
}

function buildSlowLogs(ping: {
  name: string
  duration_ms: number
  avg_duration: number
  output?: string
}): string {
  const ratio = Math.round((ping.duration_ms / ping.avg_duration) * 10) / 10
  return [
    `PERFORMANCE: Le job "${ping.name}" a tourné ${ratio}× plus lentement que d'habitude.`,
    `Durée actuelle  : ${ping.duration_ms}ms`,
    `Durée moyenne   : ${Math.round(ping.avg_duration)}ms (7 derniers jours)`,
    `Facteur d'anomalie : ×${ratio}`,
    ping.output ? `\nDerniers logs :\n${ping.output.slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n')
}

function isAnomalySlow(durationMs: number, avgDuration: number, threshold = 2.5): boolean {
  if (!avgDuration || avgDuration === 0) return false
  return durationMs >= avgDuration * threshold   // >= : inclut exactement le seuil
}

describe('Timeout checker — log builders', () => {

  it('buildLateLogs includes job name', () => {
    const log = buildLateLogs({
      name: 'backup-postgres',
      last_ping_at: new Date(Date.now() - 90 * 60 * 1000),
      grace_period: 300,
    })
    expect(log).toContain('backup-postgres')
    expect(log).toContain('TIMEOUT')
  })

  it('buildLateLogs shows "jamais" when never pinged', () => {
    const log = buildLateLogs({
      name: 'new-job',
      last_ping_at: null,
      grace_period: 300,
    })
    expect(log).toContain('jamais')
  })

  it('buildLateLogs includes schedule when provided', () => {
    const log = buildLateLogs({
      name: 'job',
      last_ping_at: null,
      grace_period: 300,
      schedule: '0 2 * * *',
    })
    expect(log).toContain('0 2 * * *')
  })

  it('buildSlowLogs calculates ratio correctly', () => {
    const log = buildSlowLogs({
      name: 'etl-job',
      duration_ms: 500_000,
      avg_duration: 200_000,
    })
    expect(log).toContain('2.5×')
    expect(log).toContain('PERFORMANCE')
    expect(log).toContain('500000ms')
    expect(log).toContain('200000ms')
  })

  it('buildSlowLogs truncates long output', () => {
    const log = buildSlowLogs({
      name: 'job',
      duration_ms: 10000,
      avg_duration: 1000,
      output: 'A'.repeat(2000),
    })
    // output tronqué à 1000 chars dans buildSlowLogs
    expect(log.length).toBeLessThan(2000 + 200)
  })
})

describe('Anomaly detection', () => {

  it('detects job 2.5x slower than baseline', () => {
    expect(isAnomalySlow(250_000, 100_000)).toBe(true)
  })

  it('does not flag job at 2x (below threshold)', () => {
    expect(isAnomalySlow(200_000, 100_000)).toBe(false)
  })

  it('does not flag when no baseline available', () => {
    expect(isAnomalySlow(100_000, 0)).toBe(false)
  })

  it('handles custom threshold', () => {
    expect(isAnomalySlow(310_000, 100_000, 3.0)).toBe(true)
    expect(isAnomalySlow(290_000, 100_000, 3.0)).toBe(false)
  })
})

describe('Cron-aware late detection', () => {
  const now = Date.parse('2026-06-07T12:00:00Z')
  const min = 60_000

  it('flags a frequent job that stopped (le bug que prev() ratait)', () => {
    // chaque minute, dernier ping il y a 10min, grace 5min → en retard
    expect(isLate({ schedule: '* * * * *', grace_period: 300, last_ping_at: new Date(now - 10*min) }, now)).toBe(true)
  })

  it('does not flag a frequent job pinged recently', () => {
    expect(isLate({ schedule: '* * * * *', grace_period: 300, last_ping_at: new Date(now - 30_000) }, now)).toBe(false)
  })

  it('falls back to grace when no schedule (late)', () => {
    expect(isLate({ grace_period: 300, last_ping_at: new Date(now - 10*min) }, now)).toBe(true)
  })

  it('falls back to grace when no schedule (within grace)', () => {
    expect(isLate({ grace_period: 300, last_ping_at: new Date(now - 2*min) }, now)).toBe(false)
  })

  it('falls back to grace on invalid schedule', () => {
    expect(isLate({ schedule: 'pas-un-cron', grace_period: 300, last_ping_at: new Date(now - 10*min) }, now)).toBe(true)
  })

  it('flags a never-pinged job past its first expected run', () => {
    expect(isLate({ grace_period: 300, last_ping_at: null, created_at: new Date(now - 10*min) }, now)).toBe(true)
  })
})

// ─── Détection hung (miroir de hungThreshold dans timeout.checker) ────────────
const HUNG_FLOOR_MS = 120_000, HUNG_NO_BASELINE_MS = 3_600_000
function hungThreshold(avgDur) {
  return avgDur && avgDur > 0 ? Math.max(avgDur * 3, HUNG_FLOOR_MS) : HUNG_NO_BASELINE_MS
}
function isHung(startedMsAgo, avgDur) { return startedMsAgo > hungThreshold(avgDur) }

describe('Hung job detection', () => {
  const min = 60_000

  it('flags a job running 3× its baseline', () => {
    // baseline 2min → seuil 6min ; tourne depuis 7min → hung
    expect(isHung(7*min, 120_000)).toBe(true)
  })

  it('does not flag a job within 3× baseline', () => {
    expect(isHung(5*min, 120_000)).toBe(false)
  })

  it('uses a 2min floor for very fast jobs', () => {
    // baseline 1s → 3× = 3s, mais plancher 2min → pas hung à 90s
    expect(isHung(90_000, 1000)).toBe(false)
    expect(isHung(3*min, 1000)).toBe(true)
  })

  it('falls back to 1h without baseline', () => {
    expect(isHung(30*min, 0)).toBe(false)
    expect(isHung(70*min, 0)).toBe(true)
  })
})
