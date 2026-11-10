import { describe, it, expect } from 'vitest'
import { validateChoice, HYPOTHESES } from '../src/services/llm/hypotheses'

const LOGS = 'starting sync\n/usr/bin/env: node: No such file or directory\nexit 127'

describe('raisonnement par hypothèses : le code vérifie le choix du modèle', () => {
  it('accepte un mécanisme connu appuyé sur une ligne réelle (espaces et casse tolérés)', () => {
    const c = validateChoice({ ligne: '/usr/bin/env:  NODE: No such file or directory', indice: 'node introuvable', hypothese: 'cron-path' }, LOGS)
    expect(c?.hypothesis.id).toBe('cron-path')
  })
  it('refuse une citation absente des logs (inventée)', () => {
    expect(validateChoice({ ligne: 'node: command not found in PATH', indice: '', hypothese: 'cron-path' }, LOGS)).toBeNull()
  })
  it('refuse « aucune », un identifiant inconnu, une citation trop courte ou une réponse vide', () => {
    expect(validateChoice({ ligne: '/usr/bin/env: node: No such file or directory', hypothese: 'aucune' }, LOGS)).toBeNull()
    expect(validateChoice({ ligne: '/usr/bin/env: node: No such file or directory', hypothese: 'oom' }, LOGS)).toBeNull()
    expect(validateChoice({ ligne: 'exit 127', hypothese: 'cron-path' }, LOGS)).toBeNull()
    expect(validateChoice(null, LOGS)).toBeNull()
  })
  it('identifiants uniques, chaque mécanisme a cause, action et vérification', () => {
    expect(new Set(HYPOTHESES.map(h => h.id)).size).toBe(HYPOTHESES.length)
    for (const h of HYPOTHESES) expect(h.cause && h.action && h.checks.length && h.when).toBeTruthy()
  })
})
