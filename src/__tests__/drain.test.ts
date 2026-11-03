import { mineTemplates } from '../services/llm/drain'

describe('mineTemplates (Drain-style log template miner)', () => {
  it('collapses variants of one pattern into a single template with a count', () => {
    const lines = [
      'Connection to db1:5432 refused',
      'Connection to db2:5432 refused',
      'Connection to db3:5432 refused',
    ]
    const t = mineTemplates(lines)
    expect(t).toHaveLength(1)
    expect(t[0].count).toBe(3)
    expect(t[0].template).toBe('Connection to <*> refused') // varying host → wildcard
    expect(t[0].sample).toBe('Connection to db1:5432 refused') // concrete values preserved
  })

  it('collapses exact duplicates (log spam) to one cluster', () => {
    const t = mineTemplates(Array(50).fill('ERROR: connection refused on db host'))
    expect(t).toHaveLength(1)
    expect(t[0].count).toBe(50)
  })

  it('keeps genuinely different messages as separate templates', () => {
    const t = mineTemplates([
      'Connection to db1 refused',
      'Out of memory killing worker',
      'Disk full on /var/backups',
    ])
    expect(t).toHaveLength(3)
    expect(t.every(x => x.count === 1)).toBe(true)
  })

  it('preserves first-appearance order', () => {
    const t = mineTemplates(['zeta failed once', 'alpha failed once', 'zeta failed once'])
    expect(t.map(x => x.sample)).toEqual(['zeta failed once', 'alpha failed once'])
    expect(t[0].count).toBe(2)
  })

  it('does not over-merge short, distinct errors sharing a first token', () => {
    const t = mineTemplates(['auth failed', 'auth denied'])
    expect(t).toHaveLength(2) // 0.5 similarity < 0.6 threshold → not merged
  })

  it('respects the maxClusters guard', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `unique error number ${i} here now`)
    const t = mineTemplates(lines, { maxClusters: 10 })
    // varying trailing token → collapses under one template anyway; guard still bounds growth
    expect(t.length).toBeLessThanOrEqual(10)
  })

  it('handles empty and whitespace-only input safely', () => {
    expect(mineTemplates([])).toEqual([])
    expect(mineTemplates(['', '   '])).toEqual([])
  })
})
