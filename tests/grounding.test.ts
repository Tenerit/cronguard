import { describe, it, expect } from 'vitest'
import { groundWithKnownFix } from '../src/services/llm/analyzer'

// Ce que l'opérateur lit doit être honnête : une ligne d'erreur recopiée n'est pas une cause, et une
// fiche à plusieurs hypothèses n'est pas une certitude.
const model = (cause: string, confidence: 'high' | 'medium' | 'low' = 'high') =>
  ({ cause, action: 'relancer', category: 'unknown' as const, checks: [], confidence, knownFix: null, finding: undefined })

describe('ancrage du diagnostic', () => {
  it('symptôme recopié par le modèle : présenté comme non établi, confiance basse', () => {
    const r = groundWithKnownFix(model('widget frobnication failed at stage three'), 'boot\nFATAL: widget frobnication failed at stage three (code 5)\n')
    expect(r.cause).toMatch(/^Cause non établie/)
    expect(r.confidence).toBe('low')
  })
  it('vraie explication du modèle (mots absents du log) : gardée, plafonnée à medium', () => {
    const r = groundWithKnownFix(model('Le serveur distant a été redémarré pendant la maintenance nocturne'), 'error: connection lost\n')
    expect(r.cause).toMatch(/redémarré/)
    expect(r.confidence).toBe('medium')
  })
  it('fiche à plusieurs hypothèses : confiance moyenne ; fiche univoque : haute', () => {
    expect(groundWithKnownFix(model('x'), 'mysqldump: Got error: 1045: Access denied for user \'u\'@\'h\' (using password: YES)').confidence).toBe('medium')
    expect(groundWithKnownFix(model('x'), 'pg_dump: error: aborting because of server version mismatch').confidence).toBe('high')
  })
})
