import { sendAlert, sendEmailAlert, sendSlackAlert } from '../services/alerts'
import type { AlertPayload } from '../services/alerts'
import axios from 'axios'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' })

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}))

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// La garde anti-SSRF résout le hostname du webhook ; on le fait pointer vers une
// IP publique pour que les envois passent (sinon dns réel = flaky/offline).
jest.mock('dns', () => ({
  promises: { lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
}))

// bumpNotifyFail incrémente un compteur Redis sur échec → mock pour éviter une vraie
// connexion ioredis (handle ouvert) pendant les tests d'alerte.
jest.mock('../config/redis', () => ({ redis: { incr: jest.fn().mockResolvedValue(1) } }))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basePayload: AlertPayload = {
  jobName:       'backup-postgres',
  env:           'production',
  lastPingAt:    '2026-05-25T02:00:00Z',
  statusPageUrl: 'http://localhost:3000/status/mon-1',
  client: {
    email:        'ops@company.com',
    slackWebhook: 'https://hooks.slack.com/test',
  },
}

const payloadWithAI: AlertPayload = {
  ...basePayload,
  analysis: {
    cause:       'Connexion PostgreSQL réinitialisée',
    action:      'Augmenter tcp_keepalives_idle',
    prevention:  'Configurer tcp_keepalives_idle à 120s dans postgresql.conf',
    checks:      ['Vérifier pg_stat_activity', 'Contrôler max_connections'],
    severity:    'high',
    category:    'database' as const,
    confidence:  'high' as const,
    data_impact: 'none' as const,
    fix_minutes: 15,
    fromCache:   false,
    model:       'qwen3:8b',
  },
}

const payloadRepeat: AlertPayload = {
  ...payloadWithAI,
  alertCount: 5,
  firstFired: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SMTP_PASS = 'test-pass'
  process.env.SMTP_FROM = 'alerts@cronguard.io'
})

describe('sendEmailAlert()', () => {
  it('sends email with correct recipient and subject', async () => {
    await sendEmailAlert(basePayload)

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('ops@company.com')
    expect(call.subject).toContain('backup-postgres')
    expect(call.subject).toContain('production')
  })

  it('includes AI diagnosis in email when available', async () => {
    await sendEmailAlert(payloadWithAI)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Analyse IA')
    expect(call.html).toContain('Connexion PostgreSQL réinitialisée')
    expect(call.html).toContain('Augmenter tcp_keepalives_idle')
  })

  it('shows fallback text when no AI analysis', async () => {
    await sendEmailAlert(basePayload)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Analyse IA indisponible')
  })

  it('HTML-escapes LLM output + job name in the email (no XSS via cause/jobName)', async () => {
    const evil: AlertPayload = {
      ...payloadWithAI,
      jobName: 'job<script>1</script>',
      analysis: { ...payloadWithAI.analysis!, cause: '<script>alert(1)</script>' },
    }
    await sendEmailAlert(evil)

    const html = mockSendMail.mock.calls[0][0].html
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('job<script>1</script>')
  })

  it('includes status page link', async () => {
    await sendEmailAlert(basePayload)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('http://localhost:3000/status/mon-1')
  })

  it('does not throw on SMTP error — catches silently', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'))
    await expect(sendEmailAlert(basePayload)).resolves.not.toThrow()
  })
})

describe('sendSlackAlert()', () => {
  it('sends Slack message to webhook URL', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })
    await sendSlackAlert(basePayload)

    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    const [url, body] = mockedAxios.post.mock.calls[0]
    expect(url).toBe('https://hooks.slack.com/test')
    expect(body).toHaveProperty('blocks')
  })

  it('skips Slack when no webhook configured', async () => {
    const noSlack: AlertPayload = { ...basePayload, client: { email: 'ops@co.com' } }
    await sendSlackAlert(noSlack)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('includes AI analysis in Slack blocks when available', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })
    await sendSlackAlert(payloadWithAI)

    const blocks = (mockedAxios.post.mock.calls[0][1] as any).blocks
    const analysisBlock = blocks.find((b: Record<string,any>) =>
      JSON.stringify(b).includes('Analyse IA')
    )
    expect(analysisBlock).toBeDefined()
    expect(JSON.stringify(analysisBlock)).toContain('Connexion PostgreSQL')
  })

  it('adds [REPEAT] prefix and incident duration for repeated alerts', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })
    await sendSlackAlert(payloadRepeat)

    const header = (mockedAxios.post.mock.calls[0][1] as any).blocks[0]
    expect(header.text.text).toContain('[REPEAT]')

    const fields = (mockedAxios.post.mock.calls[0][1] as any).blocks[1].fields
    const hasCount    = fields.some((f: Record<string,any>) => f.text.includes('Alertes envoyées'))
    const hasDuration = fields.some((f: Record<string,any>) => f.text.includes('Durée incident'))
    expect(hasCount).toBe(true)
    expect(hasDuration).toBe(true)
  })

  it('does not add [REPEAT] on first alert', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })
    await sendSlackAlert({ ...payloadWithAI, alertCount: 1 })

    const header = (mockedAxios.post.mock.calls[0][1] as any).blocks[0]
    expect(header.text.text).not.toContain('[REPEAT]')
  })

  it('does not throw on Slack error — catches silently', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'))
    await expect(sendSlackAlert(basePayload)).resolves.not.toThrow()
  })
})

describe('lignes de log liées', () => {
  const withEv = { ...payloadWithAI, analysis: { ...payloadWithAI.analysis!, evidence: ['FATAL: <b>pool</b> exhausted ```x```'] } }
  it('apparaissent échappées dans le mail, en bloc de code Slack et dans le webhook', async () => {
    await sendEmailAlert(withEv)
    const html = mockSendMail.mock.calls[0][0].html
    expect(html).toContain('FATAL: &lt;b&gt;pool&lt;/b&gt; exhausted')
    expect(html).not.toContain('<b>pool</b>')
    await sendSlackAlert(withEv)
    const text = JSON.stringify((mockedAxios.post.mock.calls[0][1] as any).blocks)
    expect(text).toContain('Lignes de log liées')
    expect(text).not.toContain('```x```')   // ne casse pas le bloc de code Slack
  })
})

describe('correction connue (pack)', () => {
  const kf = { id: 'disk-full', category: 'resources' as const, title: 'Disque <plein>', cause: 'Volume plein', action: 'Purger', steps: ['df -h', 'du -xh / | sort -h'] }
  const withKf = { ...payloadWithAI, analysis: { ...payloadWithAI.analysis!, knownFix: kf } }
  it('mail (échappé), Slack et webhook la présentent comme « à adapter »', async () => {
    await sendEmailAlert(withKf)
    const html = mockSendMail.mock.calls[0][0].html
    expect(html).toContain('Correction connue (à adapter) — Disque &lt;plein&gt;')
    expect(html).toContain('<li>du -xh / | sort -h</li>')
    await sendSlackAlert(withKf)
    expect(JSON.stringify((mockedAxios.post.mock.calls[0][1] as any).blocks)).toContain('• df -h')
  })
  it('absente quand le pack ne se déclenche pas', async () => {
    await sendEmailAlert(payloadWithAI)
    expect(mockSendMail.mock.calls[0][0].html).not.toContain('Correction connue')
  })
})

describe('lien « ce qui a réglé la panne »', () => {
  const withFix = { ...payloadWithAI, fixUrl: 'http://localhost:3000/dashboard#fix=an-1' }
  it('apparaît dans le mail et dans un bouton Slack', async () => {
    await sendEmailAlert(withFix)
    expect(mockSendMail.mock.calls[0][0].html).toContain('dashboard#fix=an-1')
    await sendSlackAlert(withFix)
    const actions = (mockedAxios.post.mock.calls[0][1] as any).blocks.find((b: any) => b.type === 'actions')
    expect(actions.elements.map((e: any) => e.url)).toContain('http://localhost:3000/dashboard#fix=an-1')
  })
  it('absent sans analyse enregistrée', async () => {
    await sendSlackAlert(payloadWithAI)
    const actions = (mockedAxios.post.mock.calls[0][1] as any).blocks.find((b: any) => b.type === 'actions')
    expect(actions.elements).toHaveLength(1)
  })
})

describe('sendAlert() — orchestration', () => {
  it('sends both email and Slack in parallel', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })

    await sendAlert(payloadWithAI)

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })

  it('sends email even if Slack fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Slack down'))

    await sendAlert(payloadWithAI)

    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('sends Slack even if email fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'))
    mockedAxios.post.mockResolvedValueOnce({ data: 'ok' })

    await sendAlert(payloadWithAI)

    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })
})
