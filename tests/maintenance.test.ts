/**
 * Tests fenêtres de maintenance (#9).
 * Pure logic — no DB, no network.
 */
import { describe, it, expect } from 'vitest'
import { isWindowActive, isMonitorInMaintenance, MaintenanceWindow } from '../src/services/maintenance'

// Helpers
function minsAgo(n: number) { return new Date(Date.now() - n * 60_000) }
function minsFromNow(n: number) { return new Date(Date.now() + n * 60_000) }

// Génère une expression cron dont la dernière occurrence est ~N minutes avant `ref`.
// Utilise une fenêtre "chaque minute" pour simplifier les tests temporels.
const EVERY_MINUTE = '* * * * *'   // fires every minute → last occurrence max 1 min ago

function window(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id:          'w-1',
    clientId:    'cli-1',
    monitorId:   null,
    label:       'nightly',
    cronExpr:    EVERY_MINUTE,
    durationMin: 60,
    active:      true,
    ...overrides,
  }
}

describe('isWindowActive', () => {
  it('true when inside window duration', () => {
    // Every-minute cron → last occurrence < 60s ago, duration 60 min → active
    expect(isWindowActive(EVERY_MINUTE, 60)).toBe(true)
  })

  it('false when past window duration', () => {
    // duration = 0 min → always expired
    expect(isWindowActive(EVERY_MINUTE, 0)).toBe(false)
  })

  it('false when cron is invalid', () => {
    expect(isWindowActive('not-a-cron', 60)).toBe(false)
  })

  it('true when now is well within duration (every-minute cron, 120-min window)', () => {
    // Last occurrence < 60s ago, window = 120 min → clearly inside
    expect(isWindowActive(EVERY_MINUTE, 120)).toBe(true)
  })

  it('false when duration is shorter than time since last occurrence', () => {
    // Every-minute cron fires at most 60s ago.
    // Duration = 0.5 min = 30s → last occurrence was ~0–60s ago.
    // Half the time this passes, half it doesn't. Use 0 to be deterministic.
    expect(isWindowActive(EVERY_MINUTE, 0)).toBe(false)
  })
})

describe('isMonitorInMaintenance', () => {
  it('false when no windows', () => {
    expect(isMonitorInMaintenance('mon-1', [])).toBe(false)
  })

  it('true for global window (monitorId null) when active', () => {
    expect(isMonitorInMaintenance('mon-1', [window()])).toBe(true)
  })

  it('true for targeted window matching the monitor', () => {
    expect(isMonitorInMaintenance('mon-1', [window({ monitorId: 'mon-1' })])).toBe(true)
  })

  it('false for targeted window on a different monitor', () => {
    expect(isMonitorInMaintenance('mon-1', [window({ monitorId: 'mon-2' })])).toBe(false)
  })

  it('false when window duration is 0 (expired immediately)', () => {
    expect(isMonitorInMaintenance('mon-1', [window({ durationMin: 0 })])).toBe(false)
  })

  it('stops at first matching active window', () => {
    const expired  = window({ monitorId: 'mon-1', durationMin: 0 })        // expired
    const active   = window({ monitorId: null,    durationMin: 60 })        // global, active
    expect(isMonitorInMaintenance('mon-1', [expired, active])).toBe(true)
  })
})
