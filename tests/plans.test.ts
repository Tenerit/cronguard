/**
 * Tests plans / monétisation — logique pure de gating (limites + IA).
 */
import { describe, it, expect, vi } from 'vitest'
import { monitorLimitFor, planHasAI, PLANS, FREE_MONITOR_LIMIT } from '../src/config/plans'

// Limite de plan active seulement avec la facturation ; lu au chargement de plans.ts.
vi.hoisted(() => { process.env.STRIPE_SECRET_KEY = 'sk_test_x' })

describe('plans config', () => {
  it('auto-hébergé sans Stripe : monitors illimités, même en plan free', async () => {
    vi.resetModules()
    delete process.env.STRIPE_SECRET_KEY
    const fresh = await import('../src/config/plans')
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    expect(fresh.monitorLimitFor('free')).toBe(Infinity)
    expect(fresh.planHasAI('free')).toBe(true)
  })

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


  it('le pricing expose un prix et des features par plan', () => {
    expect(PLANS.free.priceUsd).toBe(0)
    expect(PLANS.pro.priceUsd).toBeGreaterThan(0)
    expect(PLANS.pro.features.length).toBeGreaterThan(0)
  })
})
