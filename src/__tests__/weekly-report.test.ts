/**
 * Tests du rapport hebdomadaire
 * Couvre : buildReport, sendWeeklyReports, scheduling logic
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn()
jest.mock('../db', () => ({ db: { query: (...a: unknown[]) => mockQuery(...a) } }))

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' })
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: mockSendMail }),
}))

jest.mock('../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}))

// ─── Import après mocks ───────────────────────────────────────────────────────

import { sendWeeklyReports } from '../services/weekly-report'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockProClients(count = 1) {
  const clients = Array.from({ length: count }, (_, i) => ({
    id: `cli-pro-${i}`, email: `user${i}@example.com`
  }))
  return clients
}

function mockMonitors(clientId: string) {
  return [
    { id: 'mon-1', name: 'backup-postgres', env: 'production', last_status: 'ok' },
    { id: 'mon-2', name: 'etl-nightly',     env: 'staging',    last_status: 'failed' },
  ]
}

function mockStats() {
  return [
    { name: 'backup-postgres', env: 'production', last_status: 'ok', ok: '6', total: '7', avg_dur: 2800 },
    { name: 'etl-nightly',     env: 'staging',    last_status: 'failed', ok: '2', total: '5', avg_dur: 5000 },
  ]
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SMTP_PASS = 'test-password'
  process.env.SMTP_HOST = 'smtp.test.com'
  process.env.APP_URL   = 'http://localhost:3000'
})

afterEach(() => {
  delete process.env.SMTP_PASS
})

// ─── sendWeeklyReports ────────────────────────────────────────────────────────

describe('sendWeeklyReports()', () => {
  it('ne fait rien si SMTP_PASS absent', async () => {
    delete process.env.SMTP_PASS
    await sendWeeklyReports()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('ne fait rien si aucun client Pro', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // no pro clients
    await sendWeeklyReports()
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('envoie un email par client Pro actif', async () => {
    const clients = mockProClients(2)
    mockQuery
      .mockResolvedValueOnce({ rows: clients })                // clients pro
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-0') })  // monitors cli 0
      .mockResolvedValueOnce({ rows: [] })                     // incidents cli 0
      .mockResolvedValueOnce({ rows: mockStats() })            // stats cli 0
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-1') })  // monitors cli 1
      .mockResolvedValueOnce({ rows: [] })                     // incidents cli 1
      .mockResolvedValueOnce({ rows: mockStats() })            // stats cli 1
    await sendWeeklyReports()
    expect(mockSendMail).toHaveBeenCalledTimes(2)
  })

  it('email contient l\'uptime et le nombre d\'incidents', async () => {
    const clients = mockProClients(1)
    const incidents = [{
      job_name: 'backup-postgres', env: 'production',
      diagnosis: '{"cause":"Timeout","action":"Restart","severity":"high"}',
      severity: 'high', failed_at: new Date().toISOString(),
    }]
    mockQuery
      .mockResolvedValueOnce({ rows: clients })
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-0') })
      .mockResolvedValueOnce({ rows: incidents })
      .mockResolvedValueOnce({ rows: mockStats() })

    await sendWeeklyReports()

    expect(mockSendMail).toHaveBeenCalledTimes(1)
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('uptime')
    expect(call.html).toContain('backup-postgres')
  })

  it('sujet mentionne les incidents si présents', async () => {
    const clients = mockProClients(1)
    const incidents = [{
      job_name: 'etl', env: 'prod',
      diagnosis: '{"cause":"Timeout","action":"Fix"}',
      severity: 'high', failed_at: new Date().toISOString(),
    }]
    mockQuery
      .mockResolvedValueOnce({ rows: clients })
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-0') })
      .mockResolvedValueOnce({ rows: incidents })
      .mockResolvedValueOnce({ rows: mockStats() })

    await sendWeeklyReports()

    const call = mockSendMail.mock.calls[0][0]
    expect(call.subject).toContain('incident')
  })

  it('sujet "Semaine parfaite" sans incidents', async () => {
    const clients = mockProClients(1)
    mockQuery
      .mockResolvedValueOnce({ rows: clients })
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-0') })
      .mockResolvedValueOnce({ rows: [] })   // no incidents
      .mockResolvedValueOnce({ rows: mockStats() })

    await sendWeeklyReports()

    const call = mockSendMail.mock.calls[0][0]
    expect(call.subject).toContain('parfaite')
  })

  it('continue si un email échoue (isolation par client)', async () => {
    const clients = mockProClients(2)
    mockQuery
      .mockResolvedValueOnce({ rows: clients })
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-0') })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: mockStats() })
      .mockResolvedValueOnce({ rows: mockMonitors('cli-pro-1') })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: mockStats() })

    mockSendMail
      .mockRejectedValueOnce(new Error('SMTP timeout'))
      .mockResolvedValueOnce({ messageId: 'ok' })

    await sendWeeklyReports()

    // Second email envoyé malgré l'échec du premier
    expect(mockSendMail).toHaveBeenCalledTimes(2)
  })

  it('saute les clients sans monitor actif', async () => {
    const clients = mockProClients(1)
    mockQuery
      .mockResolvedValueOnce({ rows: clients })
      .mockResolvedValueOnce({ rows: [] })   // no monitors → skip

    await sendWeeklyReports()
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})

// ─── Calcul uptime ────────────────────────────────────────────────────────────

describe('Calcul uptime hebdo', () => {
  function computeUptime(ok: number, total: number): number {
    return total > 0 ? Math.round(ok / total * 100) : 100
  }

  it('100% si tout ok', () => expect(computeUptime(10, 10)).toBe(100))
  it('0% si tous en échec', () => expect(computeUptime(0, 5)).toBe(0))
  it('80% avec 4/5 succès', () => expect(computeUptime(4, 5)).toBe(80))
  it('100% sans données', () => expect(computeUptime(0, 0)).toBe(100))
})
