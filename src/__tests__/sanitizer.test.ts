import { sanitizeLogs, hashError, fingerprintLogs } from '../services/sanitizer'

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

  // ─── Fingerprint : variantes volatiles → même empreinte (cache hit) ──────────
  it('same error with a different timestamp → same hash', () => {
    const a = 'etl-warehouse'
    expect(hashError(a, '2026-06-14T02:00:01Z ERROR ECONNREFUSED 10.0.1.45:5439'))
      .toBe(hashError(a, '2026-06-15T09:33:48Z ERROR ECONNREFUSED 10.0.1.45:5439'))
  })

  it('same error with different PID / line numbers → same hash', () => {
    const j = 'cleanup'
    expect(hashError(j, 'deadlock detected pid 12345 at db.js:134:28'))
      .toBe(hashError(j, 'deadlock detected pid 88472 at db.js:991:12'))
  })

  it('same error from a different host IP → same hash', () => {
    const j = 'sync'
    expect(hashError(j, 'connect ECONNREFUSED 10.0.1.45:5439'))
      .toBe(hashError(j, 'connect ECONNREFUSED 192.168.9.2:5439'))
  })

  it('genuinely different errors still differ after normalization', () => {
    const j = 'job'
    expect(hashError(j, 'ECONNREFUSED at 02:00:01'))
      .not.toBe(hashError(j, 'out of memory at 02:00:01'))
  })

  it('does not collide two errors sharing a long (>600c) common prefix', () => {
    const banner = 'starting backup pipeline step initialise connection pool warming\n'.repeat(12) // >600c
    expect(hashError('job', banner + 'FATAL: disk full no space left'))
      .not.toBe(hashError('job', banner + 'FATAL: out of memory cannot allocate'))
  })

  it('same error with different durations → same hash (cache hit)', () => {
    const j = 'etl'
    expect(hashError(j, 'query timed out after 3630s')).toBe(hashError(j, 'query timed out after 3712s'))
    expect(hashError(j, 'finished in 1.5 seconds then failed')).toBe(hashError(j, 'finished in 22 seconds then failed'))
    expect(hashError(j, 'hung for 1h30m')).toBe(hashError(j, 'hung for 2h5m10s'))
    expect(hashError(j, 'retry in 120000ms')).toBe(hashError(j, 'retry in 45 min'))
  })

  it('same error with different sizes → same hash (cache hit)', () => {
    const j = 'backup'
    expect(hashError(j, 'no space left: needed 512MB')).toBe(hashError(j, 'no space left: needed 1.2 GB'))
    expect(hashError(j, 'dump aborted after 4096 bytes')).toBe(hashError(j, 'dump aborted after 88 KiB'))
  })

  it('a zero duration or size stays distinct: it means nothing happened', () => {
    const j = 'backup'
    expect(hashError(j, 'wrote 0 bytes')).not.toBe(hashError(j, 'wrote 512 bytes'))
    expect(hashError(j, 'ran for 0s')).not.toBe(hashError(j, 'ran for 40s'))
  })

  it('numbers that are not durations or sizes stay distinct', () => {
    const j = 'job'
    expect(hashError(j, 'exit code 137')).not.toBe(hashError(j, 'exit code 143'))
    expect(hashError(j, 'HTTP 503 service unavailable')).not.toBe(hashError(j, 'HTTP 502 service unavailable'))
    expect(hashError(j, 'retry 5 to 10 times')).not.toBe(hashError(j, 'retry 7 to 10 times'))
    expect(hashError(j, 'connect to port 5432')).not.toBe(hashError(j, 'connect to port 3306'))
    expect(hashError(j, 'pg_dump 15 mismatch')).not.toBe(hashError(j, 'pg_dump 16 mismatch'))
  })

  it('fingerprintLogs neutralises volatile tokens', () => {
    const fp = fingerprintLogs('2026-06-14T02:00:01Z pid 12345 uuid 550e8400-e29b-41d4-a716-446655440000 at x.js:10:5 ip 10.0.0.1:5432 count 9847211')
    expect(fp).toContain('<ts>')
    expect(fp).toContain('<pid>')
    expect(fp).toContain('<uuid>')
    expect(fp).toContain('<line>')
    expect(fp).toContain('<ip>')
    expect(fp).toContain('<n>')
    expect(fp).not.toContain('12345')
    expect(fp).not.toContain('550e8400')
  })
})
