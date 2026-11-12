import { describe, it, expect } from 'vitest'
import { pilotReport, sourceOf } from '../src/services/pilot-report'

const an = [
  { recognized_by: 'ctx-path-missing', confirmed: true, observed_fix: true, user_feedback: 'positive', signature: 's1', name: 'backup' },
  { recognized_by: 'team-12', confirmed: false, observed_fix: false, user_feedback: null, signature: 's2', name: 'backup' },
  { recognized_by: 'pg-lock', confirmed: false, observed_fix: false, user_feedback: 'negative', signature: 's3', name: 'etl' },
  { recognized_by: null, confirmed: false, observed_fix: false, user_feedback: null, signature: 'ERROR secret thing', name: 'etl' },
]
const fake = {
  async query(sql: string) {
    if (sql.includes('FROM clients')) return { rows: [{ id: 'c1' }] }
    if (sql.includes('FROM pings')) return { rows: [{ runs: 120, failures: 4, jobs: 2 }] }
    if (sql.includes('FROM analyses')) return { rows: an }
    return { rows: [{ d: 60000 }, { d: 180000 }, { d: 600000 }] }
  },
}

describe('rapport pilote', () => {
  it('sources : constaté, équipe, code de sortie, bibliothèque, non établi', () => {
    expect(['ctx-x', 'cmd-y', 'memory', 'team-3', 'curl-7', 'exit-137', 'pg-lock', null].map(sourceOf))
      .toEqual(['observed', 'observed', 'team-validated', 'team-fix', 'exit-code', 'exit-code', 'library', 'unknown'])
  })
  it('chiffres, et anonymisé par défaut', async () => {
    const r = await pilotReport(fake, { days: 30 })
    expect(r).toContain('**75 %** of diagnosed failures (3/4)')
    expect(r).toContain('| Median time to restore | 3 min |')
    expect(r).toContain('| Diagnoses marked wrong by the team (👎) | 1 |')
    expect(r).not.toMatch(/backup|etl|secret thing/)
  })
  it('--names --signatures : ajoutés, avec avertissement ; seules les pannes non reconnues', async () => {
    const r = await pilotReport(fake, { names: true, signatures: true })
    expect(r).toContain('review before sharing')
    expect(r).toContain('| backup | 2 |')
    expect(r).toContain('ERROR secret thing')
    expect(r).not.toContain('`s1`')
  })
  it('plusieurs comptes : il faut choisir', async () => {
    await expect(pilotReport({ query: async () => ({ rows: [{ id: 'a' }, { id: 'b' }] }) })).rejects.toThrow(/--client/)
  })
})
