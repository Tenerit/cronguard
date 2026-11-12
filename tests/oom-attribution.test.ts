// Attribution d'un OOM : le compteur oom_kill vaut pour tout le cgroup (conteneur, ou cron.service pour tous les jobs
// d'un hôte) ; un OOM d'un autre job ne doit pas devenir la cause de celui-ci (labo clients du 12/11 : cause fausse).
import { describe, it, expect } from 'vitest'
import { contextFinding } from '../src/services/llm/run-context'

const ctx = { resources: { oomKills: 1, memMax: '209715200' } } as never
describe('OOM attribué seulement avec une trace dans le job', () => {
  it('compteur monté mais aucune trace (bogue applicatif à côté) : pas de constat OOM', () => {
    expect(contextFinding('certbot: error: unrecognized arguments: --dry-run-only', ctx, 2)?.id).not.toBe('ctx-oom')
  })
  it('code 137 (tué par le signal 9) : constat OOM, même sans log', () => {
    expect(contextFinding('', ctx, 137)?.id).toBe('ctx-oom')
  })
  it('« Killed » dans la sortie du job (enfant tué, script sorti avec 0) : constat OOM', () => {
    expect(contextFinding('/opt/jobs/cleanup.sh: line 4:    15 Killed   python3 -c ...', ctx, 0)?.id).toBe('ctx-oom')
  })
})
