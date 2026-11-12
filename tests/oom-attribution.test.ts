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

describe('SSH : clé sans agent avant « identifiants d’un autre compte » (labo terrain 2, cas g10)', () => {
  const logs = 'myuser@mybox: Permission denied (publickey,password).\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]'
  it('pas d’agent sous cron : constat agent SSH, pas « autre compte »', () => {
    expect(contextFinding(logs, { user: 'myuser', home: '/home/myuser', sshAgent: false } as never, 255)?.id).toBe('ctx-no-ssh-agent')
  })
  it('identifiants PostgreSQL absents (g30) : toujours établi, au conditionnel', () => {
    const f = contextFinding('pg_dump: error: connection to server at "127.0.0.1", port 5432 failed: fe_sendauth: no password supplied', { user: 'root', home: '/root' } as never, 1)
    expect(f?.id).toBe('ctx-other-user')
    expect(f?.cause).toContain("S'ils sont dans le HOME d'un autre compte")
  })
})
