import { describe, it, expect } from 'vitest'
import { knownFix } from '../src/services/llm/known-fixes'
import { CASES } from '../eval/cases'

// Une correction connue affichée sur la mauvaise panne fait plus de mal qu'aucune :
// chaque pack doit se déclencher sur sa panne, et sur AUCUNE autre des 26 fixtures.
const EXPECTED: Record<string, string | null> = {
  'pg-connection-refused':   'pg-connection-refused',
  'pg-too-many-connections': 'pg-too-many-connections',
  'mysql-deadlock':          'db-deadlock',
  'pg-disk-full-wal':        'pg-wal-full',
  'dns-resolution-failure':  'dns-resolution',
  'tls-cert-expired':        'tls-cert-expired',
  'oom-killer-137':          'oom-killed',
  'disk-full-enospc':        'disk-full',
  'inode-exhaustion':        'inodes-exhausted',
  'stripe-rate-limit-429':   'http-429',
}

describe('corrections connues (packs)', () => {
  it.each(CASES.map(c => [c.name, c.logs] as const))('%s', (name, logs) => {
    expect(knownFix(logs)?.id ?? null).toBe(EXPECTED[name] ?? null)
  })

  it('rien sans logs', () => {
    expect(knownFix('')).toBeNull()
  })

  it('chaque pack a un titre et des étapes', () => {
    for (const id of Object.values(EXPECTED)) {
      const c = CASES.find(x => EXPECTED[x.name] === id)!
      const f = knownFix(c.logs)!
      expect(f.title.length).toBeGreaterThan(5)
      expect(f.steps.length).toBeGreaterThanOrEqual(2)
    }
  })
})
