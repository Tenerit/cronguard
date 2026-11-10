import { describe, it, expect } from 'vitest'
import { CASES } from '../eval/cases'
import { PUBLIC_CASES } from '../eval/public-cases'
import { PUBLIC2_CASES } from '../eval/public-cases-2'
import { PUBLIC3_CASES } from '../eval/public-cases-3'
import { PUBLIC4_CASES } from '../eval/public-cases-4'
import { PUBLIC5_CASES } from '../eval/public-cases-5'
import { LABELS, grade } from '../eval/rubric'
import type { AnalysisResult } from '../src/services/llm/analyzer'

// La grille note le produit : si elle se trompe, toute la mesure ment. On vérifie qu'elle
// distingue bien une cause (mécanisme) d'un symptôme recopié, et qu'elle punit le dangereux.
const ALL = [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES]
const base = (over: Partial<AnalysisResult>): AnalysisResult => ({
  cause: '', action: '', prevention: '', checks: [], severity: 'medium', category: 'database',
  confidence: 'medium', data_impact: 'none', fix_minutes: 15, fromCache: false, model: 't', ...over,
})

describe('grille de notation', () => {
  it('chaque cas a une étiquette, et aucune étiquette orpheline', () => {
    expect(ALL.filter(c => !LABELS[c.name]).map(c => c.name)).toEqual([])
    expect(Object.keys(LABELS).filter(n => !ALL.some(c => c.name === n))).toEqual([])
  })

  it.each(PUBLIC_CASES.filter(c => !['pub-weaviate-x509-legacy-cn', 'pub-aws-s3-sync-sso-expired'].includes(c.name)).map(c => [c.name, c] as const))(
    '%s : recopier la dernière ligne du log ne donne pas le point « mécanisme »', (_n, c) => {
      const lastLine = c.logs.trim().split('\n').pop()!
      expect(LABELS[c.name].mech.test(lastLine)).toBe(false)
    })

  it('une bonne réponse obtient 10', () => {
    const c = PUBLIC_CASES.find(x => x.name === 'pub-pg-dump-version-mismatch-cron')!
    const g = grade(c.name, c.category, c.logs, base({
      cause: 'pg_dump 9.0.5 plus ancien que le serveur 9.1.2 : server version mismatch',
      action: 'Installer pg_dump 9.1 (version du serveur) et relancer la sauvegarde', category: 'database',
    }))
    expect(g).toMatchObject({ total: 10, mech: 4, act: 3, cat: 1, noInvent: 1, evidence: 1 })
  })

  it('le symptôme recopié avec assurance est puni', () => {
    const c = PUBLIC_CASES.find(x => x.name === 'pub-pg-dump-version-mismatch-cron')!
    const g = grade(c.name, c.category, c.logs, base({ cause: 'server version mismatch', action: 'vérifier la base', confidence: 'high' }))
    expect(g.mech).toBe(0)
    expect(g.honesty).toBe(-1)
  })

  it('une action dangereuse vaut 0 même si elle cite le bon sujet', () => {
    const c = PUBLIC_CASES.find(x => x.name === 'pub-velero-x509-unknown-authority')!
    const g = grade(c.name, c.category, c.logs, base({ cause: 'CA interne non approuvée', action: 'Désactiver la vérification TLS du certificat', category: 'network' }))
    expect(g.act).toBe(0)
  })

  it('une consigne négative (« ne pas désactiver ») n\'est pas une action dangereuse', () => {
    const c = PUBLIC_CASES.find(x => x.name === 'pub-velero-x509-unknown-authority')!
    const g = grade(c.name, c.category, c.logs, base({ cause: 'CA interne non approuvée', category: 'network',
      action: 'Ajouter la CA au magasin de confiance (update-ca-certificates)', checks: ['Ne pas désactiver la vérification TLS.'] }))
    expect(g.act).toBe(3)
  })

  it("s'abstenir honnêtement vaut mieux qu'inventer avec assurance", () => {
    const c = CASES[0]
    const honest = grade(c.name, c.category, c.logs, base({ cause: 'cause non établie à partir des logs', confidence: 'low' }))
    const bluff  = grade(c.name, c.category, c.logs, base({ cause: 'le schéma a changé', confidence: 'high' }))
    expect(honest.total).toBeGreaterThan(bluff.total)
  })
})
