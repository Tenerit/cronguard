import { describe, it, expect } from 'vitest'

// ─── Détection de retard cron-aware : la vraie fonction (plus de copie miroir) ───
import { isLate, graceMs } from '../src/workers/late'

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

// ─── Warm-up slowdown (miroir du garde SQL SLOW_MIN_SAMPLES) ──────────────────
// Le checker ne déclenche "slowdown" que si la baseline repose sur ≥ N succès.
const SLOW_MIN_SAMPLES = 5
function baselineMature(successSamples: number, min = SLOW_MIN_SAMPLES): boolean {
  return successSamples >= min
}
function shouldFireSlow(durationMs: number, avgDuration: number, samples: number): boolean {
  return baselineMature(samples) && isAnomalySlow(durationMs, avgDuration)
}

describe('Slowdown warm-up (anti faux-positif)', () => {
  it('ne déclenche pas sur une baseline immature, même à 2.5×', () => {
    expect(shouldFireSlow(250_000, 100_000, 2)).toBe(false)   // monitor neuf
  })
  it('déclenche une fois assez de succès accumulés', () => {
    expect(shouldFireSlow(250_000, 100_000, 5)).toBe(true)
  })
  it('exige toujours le facteur d’anomalie même avec baseline mature', () => {
    expect(shouldFireSlow(150_000, 100_000, 20)).toBe(false)  // 1.5× < 2.5×
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

describe('Grâce apprise (p95 des durées)', () => {
  const now = Date.parse('2026-06-07T12:00:00Z')
  const min = 60_000
  // Job de 20 min, lancé à 11:00 (cron horaire), grâce 5 min : son ping arrive à 11:20.
  const longJob = { schedule: '0 * * * *', grace_period: 300, last_ping_at: new Date(now - 80 * min) }

  it('sans historique : en retard à +10 min (fausse alerte d\'un job long)', () => {
    expect(isLate(longJob, now - 50 * min)).toBe(true)   // 11:10, le job tourne encore
  })
  it('avec p95 = 20 min sur 10 mesures : pas en retard pendant son exécution normale', () => {
    expect(isLate({ ...longJob, p95_ms: 20 * min, dur_n: 10 }, now - 50 * min)).toBe(false)
  })
  it('vraiment absent : signalé après 1,2 × p95', () => {
    expect(isLate({ ...longJob, p95_ms: 20 * min, dur_n: 10 }, now - 35 * min)).toBe(true)   // 11:25 > 11:00 + 24 min
  })
  it('jamais en dessous de la grâce réglée, ni avant 5 mesures, ni avec LEARNED_GRACE=off', () => {
    expect(graceMs({ grace_period: 600, p95_ms: 1000, dur_n: 30 })).toBe(600_000)
    expect(graceMs({ grace_period: 300, p95_ms: 20 * min, dur_n: 4 })).toBe(300_000)
    process.env.LEARNED_GRACE = 'off'
    expect(graceMs({ grace_period: 300, p95_ms: 20 * min, dur_n: 10 })).toBe(300_000)
    delete process.env.LEARNED_GRACE
  })
  it('p95 en texte (numeric pg) et plafonné à 24 h', () => {
    expect(graceMs({ grace_period: 300, p95_ms: String(20 * min), dur_n: '10' })).toBe(24 * min)
    expect(graceMs({ grace_period: 300, p95_ms: 48 * 3600_000, dur_n: 10 })).toBe(24 * 3600_000)
  })
})
