import { sanitizeLogs, hashError } from '../services/sanitizer'

describe('sanitizeLogs', () => {

  describe('API key detection', () => {
    it('redacts Stripe live keys (sk_live_)', () => {
      const { clean, redactedCount } = sanitizeLogs('key: sk_live_4xKj9mNpQrSt8uVwXyZa3b5c7d')
      expect(clean).toContain('[REDACTED_KEY]')
      expect(clean).not.toContain('sk_live_')
      expect(redactedCount).toBeGreaterThan(0)
    })

    it('redacts Stripe test keys (sk_test_)', () => {
      const { clean } = sanitizeLogs('Authorization: sk_test_AbCdEfGhIjKlMnOpQrStUvWx12')
      expect(clean).toContain('[REDACTED_KEY]')
    })

    it('redacts Resend keys (re_test_)', () => {
      const { clean } = sanitizeLogs('RESEND_KEY=re_test_AbCdEfGhIjKlMnOpQrStUvWxYz12')
      expect(clean).toContain('[REDACTED_KEY]')
    })

    it('redacts generic api_key= values', () => {
      const { clean } = sanitizeLogs('api_key=abc123def456ghi789jkl012mno456pqr')
      expect(clean).toContain('[REDACTED_KEY]')
    })

    it('redacts Bearer tokens', () => {
      const { clean } = sanitizeLogs('Authorization: Bearer eyABCDEFGHIJKLMNOPQRSTUVWXYZ123456')
      expect(clean).toContain('[REDACTED]')
    })
  })

  describe('JWT detection', () => {
    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const { clean } = sanitizeLogs(`token: ${jwt}`)
      expect(clean).toContain('[REDACTED_JWT]')
      expect(clean).not.toContain(jwt)
    })
  })

  describe('URL credentials', () => {
    it('redacts PostgreSQL connection strings', () => {
      const { clean } = sanitizeLogs('Connecting to postgres://admin:s3cr3t@db.prod:5432/mydb')
      expect(clean).toContain('[REDACTED]')
      expect(clean).not.toContain('s3cr3t')
    })

    it('redacts Redis URLs with password', () => {
      const { clean } = sanitizeLogs('redis://default:mypassword@redis.internal:6379')
      expect(clean).toContain('[REDACTED]')
      expect(clean).not.toContain('mypassword')
    })
  })

  describe('PII detection', () => {
    it('redacts email addresses', () => {
      const { clean } = sanitizeLogs('Error sending to user@company.com: bounce')
      expect(clean).toContain('[EMAIL]')
      expect(clean).not.toContain('user@company.com')
    })

    it('redacts private IPv4 addresses', () => {
      const { clean } = sanitizeLogs('Connection refused from 192.168.1.100')
      expect(clean).toContain('[PRIVATE_IP]')

      const { clean: clean2 } = sanitizeLogs('host 10.0.0.1 unreachable')
      expect(clean2).toContain('[PRIVATE_IP]')
    })

    it('redacts inline passwords', () => {
      const { clean } = sanitizeLogs('Config: password=MyS3cretPass!')
      expect(clean).toContain('[REDACTED]')
      expect(clean).not.toContain('MyS3cretPass')
    })
  })

  describe('AWS credentials', () => {
    it('redacts AWS access key IDs', () => {
      const { clean } = sanitizeLogs('Using AKIAIOSFODNN7EXAMPLE for S3 upload')
      expect(clean).toContain('[AWS_KEY]')
    })
  })

  describe('Safe content preservation', () => {
    it('preserves clean log messages', () => {
      const log = 'ERROR: Connection timeout after 30s\nExit code: 1\nStack trace line 42'
      const { clean, redactedCount } = sanitizeLogs(log)
      expect(clean).toBe(log)
      expect(redactedCount).toBe(0)
    })

    it('preserves short git hashes', () => {
      const { clean } = sanitizeLogs('git commit abc123def456 processed')
      expect(clean).toBe('git commit abc123def456 processed')
    })

    it('does NOT redact public IP addresses', () => {
      const { clean } = sanitizeLogs('Connected to 8.8.8.8:443')
      expect(clean).toBe('Connected to 8.8.8.8:443')
    })
  })

  describe('Truncation', () => {
    it('truncates logs exceeding 3000 characters', () => {
      const long = 'A'.repeat(5000)
      const { clean } = sanitizeLogs(long)
      expect(clean.length).toBeLessThanOrEqual(3100)
      expect(clean).toContain('[...log truncated]')
    })

    it('preserves logs under 3000 characters intact', () => {
      const short = 'Normal log line\n'.repeat(50)
      const { clean } = sanitizeLogs(short)
      expect(clean).toBe(short)
    })
  })
})

describe('hashError', () => {
  it('produces stable hashes for identical inputs', () => {
    expect(hashError('backup-job', 'Error: timeout')).toBe(
      hashError('backup-job', 'Error: timeout')
    )
  })

  it('produces different hashes for different jobs', () => {
    expect(hashError('job-a', 'same error')).not.toBe(
      hashError('job-b', 'same error')
    )
  })

  it('produces different hashes for different errors', () => {
    expect(hashError('same-job', 'error A')).not.toBe(
      hashError('same-job', 'error B')
    )
  })

  it('returns a non-empty hex string', () => {
    const hash = hashError('test', 'msg')
    expect(hash).toMatch(/^[0-9a-f]+$/)
    expect(hash.length).toBeGreaterThan(0)
  })
})
