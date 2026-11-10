import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// Les commandes de test existent en deux copies (SDK bash : python inline ; SDK Python) : elles doivent rester identiques.
const block = (f: string) => {
  const s = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  return s.slice(s.indexOf('# >>> cg-probes'), s.indexOf('# <<< cg-probes'))
}

describe('commandes de test du SDK', () => {
  it('bloc identique dans le SDK bash et le SDK Python', () => {
    const bash = block('sdk/bash/cronguard.sh'), py = block('sdk/python/cronguard.py')
    expect(bash.length).toBeGreaterThan(500)
    expect(py).toBe(bash)
  })
})
