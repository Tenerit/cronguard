import { describe, it, expect } from 'vitest'
import { FACTS, unverifiableIdentifiers, constantBaseline } from '../eval/quality'
import { CASES } from '../eval/cases'

describe('eval quality', () => {
  it('every fixture has its expected facts', () => {
    expect(CASES.map(c => c.name).filter(n => !FACTS[n])).toEqual([])
  })

  it('flags an invented parameter, not one present in the logs', () => {
    const logs = 'pool exhausted (max_connections=100)'
    expect(unverifiableIdentifiers('Augmenter max_write_size à 1GB', logs)).toEqual(['max_write_size'])
    expect(unverifiableIdentifiers('Augmenter MAX_CONNECTIONS', logs)).toEqual([])
  })

  it('flags invented options, paths, and config files', () => {
    expect(unverifiableIdentifiers('lancer pg_dump --no-owner', 'pg_dump failed')).toEqual(['--no-owner'])
    expect(unverifiableIdentifiers('éditer /etc/app/main et db.conf', 'error')).toEqual(['/etc/app/main', 'db.conf'])
  })

  it('ignores plain words and sentences', () => {
    expect(unverifiableIdentifiers('Redémarrer le service puis vérifier', 'x')).toEqual([])
  })

  it('computes the score of always answering the most frequent label', () => {
    expect(constantBaseline(['a', 'b', 'b', 'b'])).toEqual({ label: 'b', rate: 0.75 })
  })
})
