// Structure d'une erreur inconnue (2026-11-13) : type, outil, objet. Exemples tirés des données d'entraînement.
import { describe, it, expect } from 'vitest'
import { errorShape, unknownErrorLead } from '../src/services/llm/error-shape'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

describe('structure d’une erreur inconnue', () => {
  it.each([
    ["pg_dump: error: could not open output file \"/backup/db.sql\": Permission denied", 'permission', 'pg_dump', '/backup/db.sql'],
    ["KeyError: 'total_amount'", 'not-found', null, null],
    ['zsh: no such file or directory: /pg-snaps/db_2024.sql', 'not-found', 'zsh', '/pg-snaps/db_2024.sql'],
    ['curl: (7) Failed to connect to api.example.test port 443: Connection refused', 'network', 'curl', 'api.example.test'],
    ['ERROR 1045 (28000): Access denied for user', 'permission', null, null],
    ['rsync: unrecognized option --delete-afterr', 'syntax', 'rsync', null],
    ['flock: failed to get lock', 'busy', 'flock', null],
    ['tar: Error writing: No space left on device', 'resources', 'tar', null],
  ])('%s', (line, kind, tool, object) => {
    const s = errorShape(line)!
    expect(s.kind).toBe(kind)
    if (tool) expect(s.tool).toBe(tool)
    if (object) expect(s.object).toBe(object)
  })
  it('rien de sûr : pas de piste', () => {
    expect(errorShape('Done in 3.2s')).toBeNull()
    expect(unknownErrorLead('job finished with warnings')).toBeNull()
  })
  it('l’analyse sans fiche donne une piste typée, en confiance basse, sans prétendre à la cause', () => {
    // /dev/ttyACM9 : port série, ne doit plus déclencher la fiche « pas de terminal » (vu en écrivant ce test).
    const r = analysisWithoutModel({ logs: 'mywidget: cannot open /dev/ttyACM9: Operation not permitted', exitCode: 1 } as never)
    expect(r.cause).toMatch(/^Cause précise non établie\. Type d'erreur : droits refusés/)
    expect(r.confidence).toBe('low')
    expect(r.checks.some(c => /^Piste \(droits refusés\)/.test(c))).toBe(true)
  })
})
