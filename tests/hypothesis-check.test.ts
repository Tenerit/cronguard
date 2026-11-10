import { describe, it, expect } from 'vitest'
import { candidatesFor } from '../src/services/llm/hypothesis-check'

const ids = (line: string, runner?: Parameters<typeof candidatesFor>[1]) => candidatesFor(line, runner).map(h => h.id)

describe('présélection des mécanismes par le code (v2)', () => {
  it('commande introuvable : PATH en premier, au plus 4 candidats', () => {
    const c = ids('/usr/bin/env: node: No such file or directory')
    expect(c[0]).toBe('cron-path')
    expect(c.length).toBeLessThanOrEqual(4)
  })
  it('affichage graphique : un seul candidat', () => {
    expect(ids('RuntimeError: could not open display')).toEqual(['no-display'])
  })
  it('lanceur Kubernetes : rien de crontab', () => {
    expect(ids('Reason: OOMKilled', 'kubernetes')).toEqual(['k8s-memory-limit', 'k8s-schedule', 'k8s-pod-start'])
    expect(ids('No such file or directory', 'kubernetes')).not.toContain('cron-path')
  })
  it('cron dans un conteneur : variables du conteneur parmi les candidats', () => {
    expect(ids('KeyError: DATABASE_URL environ', 'container-cron')).toContain('container-cron-env')
  })
  it('aucune règle : aucun candidat (analyse libre)', () => {
    expect(ids('job finished with status 3')).toEqual([])
  })
})
