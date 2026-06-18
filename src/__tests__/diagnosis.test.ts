import { parseDiagnosis } from '../services/llm/diagnosis'

describe('parseDiagnosis — centralized, non-silent', () => {
  it('parses a valid diagnosis blob into typed fields', () => {
    const d = parseDiagnosis(JSON.stringify({
      cause: 'DB refused', action: 'check pg', prevention: 'pool', category: 'database',
      checks: ['a', 'b'], data_impact: 'none',
    }))
    expect(d.cause).toBe('DB refused')
    expect(d.action).toBe('check pg')
    expect(d.category).toBe('database')
    expect(d.checks).toEqual(['a', 'b'])
    expect(d.data_impact).toBe('none')
  })

  it('degrades a non-JSON blob to raw text as cause (instead of silently empty)', () => {
    const d = parseDiagnosis('Sorry, I cannot analyze this.')
    expect(d.cause).toBe('Sorry, I cannot analyze this.')   // texte brut conservé
    expect(d.action).toBe('')
  })

  it('returns empty fields for null/undefined', () => {
    expect(parseDiagnosis(null)).toEqual({ cause: '', action: '' })
    expect(parseDiagnosis(undefined)).toEqual({ cause: '', action: '' })
  })

  it('coerces wrong-typed fields instead of trusting the blob', () => {
    const d = parseDiagnosis(JSON.stringify({ cause: 'x', action: 'y', checks: 'not-an-array', category: 42 }))
    expect(d.checks).toBeUndefined()
    expect(d.category).toBeUndefined()
  })
})
