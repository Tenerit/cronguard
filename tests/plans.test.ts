/**
 * Tests plans / monétisation — logique pure de gating (limites + IA).
 */
import { describe, it, expect } from 'vitest'
import { monitorLimitFor, planHasAI, PLANS, FREE_MONITOR_LIMIT } from '../src/config/plans'

describe('plans config', () => {
  it('free a une limite finie de monitors, pro est illimité', () => {
    expect(monitorLimitFor('free')).toBe(FREE_MONITOR_LIMIT)
    expect(monitorLimitFor('pro')).toBe(Infinity)
    expect(Number.isFinite(monitorLimitFor('pro'))).toBe(false)
  })

  it('un plan inconnu retombe sur les limites free', () => {
    expect(monitorLimitFor('garbage')).toBe(FREE_MONITOR_LIMIT)
  })

  it('le plan pro a toujours l’IA', () => {
    expect(planHasAI('pro')).toBe(true)
  })

  it('self-hosted (pas de billing configuré) donne l’IA à tout le monde', () => {
    // STRIPE_SECRET_KEY non défini en test → BILLING_ENABLED=false → free a l’IA aussi.
    expect(planHasAI('free')).toBe(true)
  })

  it('le pricing expose un prix et des features par plan', () => {
    expect(PLANS.free.priceUsd).toBe(0)
    expect(PLANS.pro.priceUsd).toBeGreaterThan(0)
    expect(PLANS.pro.features.length).toBeGreaterThan(0)
  })
})
