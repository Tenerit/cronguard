import { isSafeWebhookTarget } from '../services/webhook-guard'
import dns from 'dns'

jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }))
const mockedLookup = dns.promises.lookup as unknown as jest.Mock

function resolvesTo(...ips: string[]) {
  mockedLookup.mockResolvedValueOnce(ips.map(address => ({ address, family: address.includes(':') ? 6 : 4 })))
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.WEBHOOK_BLOCK_PRIVATE
})

describe('isSafeWebhookTarget — SSRF guard', () => {
  it('allows a public host', async () => {
    resolvesTo('93.184.216.34')
    expect(await isSafeWebhookTarget('https://hooks.example.com/x')).toBe(true)
  })

  it('blocks the cloud metadata endpoint (169.254.169.254)', async () => {
    resolvesTo('169.254.169.254')
    expect(await isSafeWebhookTarget('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('blocks loopback', async () => {
    resolvesTo('127.0.0.1')
    expect(await isSafeWebhookTarget('http://localhost:6379/')).toBe(false)
  })

  it('blocks DNS rebinding (public name resolving to metadata IP)', async () => {
    resolvesTo('169.254.169.254')
    expect(await isSafeWebhookTarget('https://totally-legit.example.com/hook')).toBe(false)
  })

  it('blocks non-http(s) schemes without resolving DNS', async () => {
    expect(await isSafeWebhookTarget('file:///etc/passwd')).toBe(false)
    expect(mockedLookup).not.toHaveBeenCalled()
  })

  it('blocks a malformed URL', async () => {
    expect(await isSafeWebhookTarget('not a url')).toBe(false)
  })

  it('allows RFC1918 private IPs by default (air-gapped ICP)', async () => {
    resolvesTo('10.0.5.20')
    expect(await isSafeWebhookTarget('http://n8n.internal/webhook')).toBe(true)
  })

  it('blocks RFC1918 when WEBHOOK_BLOCK_PRIVATE=true (multi-tenant SaaS)', async () => {
    process.env.WEBHOOK_BLOCK_PRIVATE = 'true'
    resolvesTo('192.168.1.50')
    expect(await isSafeWebhookTarget('http://192.168.1.50/hook')).toBe(false)
  })

  it('blocks if any resolved address is internal (mixed answer)', async () => {
    resolvesTo('93.184.216.34', '127.0.0.1')
    expect(await isSafeWebhookTarget('https://mixed.example.com/x')).toBe(false)
  })
})
