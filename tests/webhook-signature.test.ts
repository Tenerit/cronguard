import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { signWebhook } from '../src/services/webhook-signature'

beforeEach(() => { delete process.env.WEBHOOK_SIGNING_SECRET })

describe('signWebhook', () => {
  it('returns no headers when WEBHOOK_SIGNING_SECRET is unset', () => {
    expect(signWebhook('{"event":"alert"}')).toEqual({})
  })

  it('signs the body with HMAC-SHA256 over `${ts}.${body}`', () => {
    process.env.WEBHOOK_SIGNING_SECRET = 'topsecret'
    const body = '{"event":"alert","job":"backup"}'
    const h = signWebhook(body)

    expect(h['X-CronGuard-Timestamp']).toMatch(/^\d+$/)
    const expected = 'sha256=' + createHmac('sha256', 'topsecret')
      .update(`${h['X-CronGuard-Timestamp']}.${body}`).digest('hex')
    expect(h['X-CronGuard-Signature']).toBe(expected)
  })

  it('a different secret yields a different signature', () => {
    const body = 'same-body'
    process.env.WEBHOOK_SIGNING_SECRET = 'secret-a'
    const a = signWebhook(body)['X-CronGuard-Signature']
    process.env.WEBHOOK_SIGNING_SECRET = 'secret-b'
    const b = signWebhook(body)['X-CronGuard-Signature']
    expect(a).not.toBe(b)
  })

  it('a tampered body breaks verification', () => {
    process.env.WEBHOOK_SIGNING_SECRET = 'k'
    const body = '{"amount":1}'
    const h = signWebhook(body)
    const recomputedTampered = 'sha256=' + createHmac('sha256', 'k')
      .update(`${h['X-CronGuard-Timestamp']}.{"amount":999}`).digest('hex')
    expect(h['X-CronGuard-Signature']).not.toBe(recomputedTampered)
  })
})
