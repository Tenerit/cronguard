/**
 * Tests RBAC (#8) — logique pure, sans DB.
 */
import { describe, it, expect } from 'vitest'
import { hasRole, Role } from '../src/api/middleware/auth'

const roles: Role[] = ['viewer', 'member', 'admin', 'owner']

describe('hasRole hierarchy', () => {
  it('owner satisfies every role', () => {
    for (const min of roles) expect(hasRole('owner', min)).toBe(true)
  })

  it('viewer satisfies only viewer', () => {
    expect(hasRole('viewer', 'viewer')).toBe(true)
    expect(hasRole('viewer', 'member')).toBe(false)
    expect(hasRole('viewer', 'admin')).toBe(false)
    expect(hasRole('viewer', 'owner')).toBe(false)
  })

  it('member satisfies viewer + member, not admin/owner', () => {
    expect(hasRole('member', 'viewer')).toBe(true)
    expect(hasRole('member', 'member')).toBe(true)
    expect(hasRole('member', 'admin')).toBe(false)
    expect(hasRole('member', 'owner')).toBe(false)
  })

  it('admin satisfies viewer + member + admin, not owner', () => {
    expect(hasRole('admin', 'viewer')).toBe(true)
    expect(hasRole('admin', 'member')).toBe(true)
    expect(hasRole('admin', 'admin')).toBe(true)
    expect(hasRole('admin', 'owner')).toBe(false)
  })

  it('same role always satisfies itself', () => {
    for (const r of roles) expect(hasRole(r, r)).toBe(true)
  })
})

// ─── requireRole middleware ───────────────────────────────────────────────────

import { requireRole } from '../src/api/middleware/ownership'
import type { Request, Response, NextFunction } from 'express'

function mockRes(role: Role) {
  const json = (body: unknown) => body
  const status = (code: number) => ({ json, end: () => code })
  return { locals: { role }, status, json } as unknown as Response
}

describe('requireRole middleware', () => {
  it('calls next() when role sufficient', () => {
    const mw  = requireRole('member')
    const res = mockRes('admin')
    let called = false
    mw({} as Request, res, (() => { called = true }) as NextFunction)
    expect(called).toBe(true)
  })

  it('returns 403 when role insufficient', () => {
    const mw  = requireRole('admin')
    const res = mockRes('viewer')
    let code = 0
    const statusFn = (c: number) => { code = c; return { json: () => {} } }
    ;(res as unknown as { status: (c: number) => { json: () => void } }).status = statusFn
    mw({} as Request, res, (() => {}) as NextFunction)
    expect(code).toBe(403)
  })

  it('defaults missing role to viewer', () => {
    const mw  = requireRole('admin')
    const res = { locals: {}, status: (c: number) => ({ json: () => c }) } as unknown as Response
    let called = false
    mw({} as Request, res, (() => { called = true }) as NextFunction)
    expect(called).toBe(false)
  })
})
