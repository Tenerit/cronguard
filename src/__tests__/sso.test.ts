import type { Request } from 'express'

// ─── Mock DB ────────────────────────────────────────────────────────────────
const members: Record<string, { client_id: string; role: string; plan: string }> = {}
let clientCount = 1
const inserted: Array<{ email: string; role: string }> = []

jest.mock('../db', () => ({
  db: {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('FROM team_members tm JOIN clients')) {
        const m = members[(params[0] as string).toLowerCase()]
        return m ? { rows: [m] } : { rows: [] }
      }
      if (sql.includes('SELECT id FROM clients LIMIT 2')) {
        return { rows: Array.from({ length: clientCount }, (_, i) => ({ id: `cli-${i}` })) }
      }
      if (sql.includes('INSERT INTO team_members')) {
        inserted.push({ email: params[1], role: params[2] })
        return { rows: [{ role: params[2] }] }
      }
      if (sql.includes('SELECT plan FROM clients WHERE id')) {
        return { rows: [{ plan: 'pro' }] }
      }
      return { rows: [] }
    }),
  },
}))

import { ssoEnabled, ssoEmail, resolveSsoUser } from '../api/middleware/sso'

function req(headers: Record<string, string>, remoteAddress = '10.0.0.9'): Request {
  return { headers, socket: { remoteAddress } } as unknown as Request
}

const SSO_ENV = ['SSO_ENABLED','SSO_TRUSTED_PROXIES','SSO_SHARED_SECRET','SSO_SECRET_HEADER',
  'SSO_EMAIL_HEADER','SSO_ALLOWED_DOMAINS','SSO_DEFAULT_ROLE','SSO_CLIENT_ID']

beforeEach(() => {
  Object.keys(members).forEach(k => delete members[k])
  inserted.length = 0
  clientCount = 1
  SSO_ENV.forEach(k => delete process.env[k])
  jest.clearAllMocks()
})

// ─── Trust / extraction ───────────────────────────────────────────────────────

describe('ssoEmail() — trust hardening (fail-closed)', () => {
  it('returns null when SSO disabled', () => {
    expect(ssoEmail(req({ 'x-forwarded-email': 'a@corp.com' }))).toBeNull()
  })

  it('returns null when enabled but NO trusted-proxy mechanism configured (fail-closed)', () => {
    process.env.SSO_ENABLED = 'true'
    expect(ssoEmail(req({ 'x-forwarded-email': 'a@corp.com' }))).toBeNull()
  })

  it('trusts via shared secret header', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_SHARED_SECRET = 's3cr3t-value'
    const r = req({ 'x-forwarded-email': 'Alice@Corp.com', 'x-cronguard-sso-secret': 's3cr3t-value' })
    expect(ssoEmail(r)).toBe('alice@corp.com')   // normalisé en minuscules
  })

  it('rejects a wrong shared secret', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_SHARED_SECRET = 's3cr3t-value'
    expect(ssoEmail(req({ 'x-forwarded-email': 'a@corp.com', 'x-cronguard-sso-secret': 'nope' }))).toBeNull()
  })

  it('rejects a same-length wrong secret (exercises the constant-time compare)', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_SHARED_SECRET = 's3cr3t-value'
    expect(ssoEmail(req({ 'x-forwarded-email': 'a@corp.com', 'x-cronguard-sso-secret': 'XXXXXX-XXXXX' }))).toBeNull()
  })

  it('trusts via source IP allowlist', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_TRUSTED_PROXIES = '10.0.0.9, 10.0.0.10'
    expect(ssoEmail(req({ 'x-forwarded-email': 'b@corp.com' }, '10.0.0.9'))).toBe('b@corp.com')
  })

  it('rejects an untrusted source IP', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_TRUSTED_PROXIES = '10.0.0.9'
    expect(ssoEmail(req({ 'x-forwarded-email': 'b@corp.com' }, '8.8.8.8'))).toBeNull()
  })

  it('handles IPv4-mapped IPv6 remote addresses', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_TRUSTED_PROXIES = '10.0.0.9'
    expect(ssoEmail(req({ 'x-forwarded-email': 'b@corp.com' }, '::ffff:10.0.0.9'))).toBe('b@corp.com')
  })

  it('honours a custom email header name', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_SHARED_SECRET = 'x'
    process.env.SSO_EMAIL_HEADER = 'X-Auth-User'
    const r = req({ 'x-auth-user': 'c@corp.com', 'x-cronguard-sso-secret': 'x' })
    expect(ssoEmail(r)).toBe('c@corp.com')
  })

  it('returns null on a malformed (non-email) header value', () => {
    process.env.SSO_ENABLED = 'true'
    process.env.SSO_SHARED_SECRET = 'x'
    expect(ssoEmail(req({ 'x-forwarded-email': 'not-an-email', 'x-cronguard-sso-secret': 'x' }))).toBeNull()
  })
})

// ─── Résolution / JIT-provisioning ─────────────────────────────────────────────

describe('resolveSsoUser()', () => {
  it('returns the existing member role (honoured as-is)', async () => {
    members['admin@corp.com'] = { client_id: 'cli-7', role: 'admin', plan: 'pro' }
    const id = await resolveSsoUser('admin@corp.com')
    expect(id).toEqual({ email: 'admin@corp.com', clientId: 'cli-7', role: 'admin', plan: 'pro' })
    expect(inserted).toHaveLength(0)
  })

  it('JIT-provisions a viewer when domain allowed + single client', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    const id = await resolveSsoUser('new@corp.com')
    expect(id?.role).toBe('viewer')
    expect(id?.clientId).toBe('cli-0')
    expect(inserted).toEqual([{ email: 'new@corp.com', role: 'viewer' }])
  })

  it('refuses JIT for a non-allowed domain', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    expect(await resolveSsoUser('intruder@evil.com')).toBeNull()
    expect(inserted).toHaveLength(0)
  })

  it('refuses JIT when no domain allowlist configured', async () => {
    expect(await resolveSsoUser('x@corp.com')).toBeNull()
  })

  it('never grants owner via SSO_DEFAULT_ROLE (coerced to viewer)', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    process.env.SSO_DEFAULT_ROLE = 'owner'
    const id = await resolveSsoUser('boss@corp.com')
    expect(id?.role).toBe('viewer')
  })

  it('honours a valid SSO_DEFAULT_ROLE (member)', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    process.env.SSO_DEFAULT_ROLE = 'member'
    const id = await resolveSsoUser('m@corp.com')
    expect(id?.role).toBe('member')
  })

  it('refuses JIT when the target client is ambiguous (multiple clients, no SSO_CLIENT_ID)', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    clientCount = 2
    expect(await resolveSsoUser('y@corp.com')).toBeNull()
  })

  it('uses SSO_CLIENT_ID when set (multi-client)', async () => {
    process.env.SSO_ALLOWED_DOMAINS = 'corp.com'
    process.env.SSO_CLIENT_ID = 'cli-explicit'
    clientCount = 5
    const id = await resolveSsoUser('z@corp.com')
    expect(id?.clientId).toBe('cli-explicit')
  })
})

describe('ssoEnabled()', () => {
  it('reflects SSO_ENABLED', () => {
    expect(ssoEnabled()).toBe(false)
    process.env.SSO_ENABLED = 'true'
    expect(ssoEnabled()).toBe(true)
  })
})
