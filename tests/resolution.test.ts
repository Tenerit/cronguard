import { describe, it, expect } from 'vitest'
import { contextDiff } from '../src/services/resolution'

describe('contextDiff — résolution constatée', () => {
  it('montre la variable fournie, le dossier réparé et la commande modifiée', () => {
    const c = contextDiff(
      { command: 'sh job.sh', context: { cwd: '/home/app', loginPath: '/bin', loginOnlyVars: ['API_TOKEN', 'OTHER'],
        paths: [{ path: '/srv/a/x.tgz', relative: false, exists: false }, { path: '/srv/a', relative: false, exists: true, owner: 'root', writable: false }] } },
      { command: 'bash job.sh', context: { cwd: '/home/app', loginPath: '/bin', loginOnlyVars: ['OTHER'],
        paths: [{ path: '/srv/a/x.tgz', relative: false, exists: true }, { path: '/srv/a', relative: false, exists: true, owner: 'app', writable: true }] } })
    expect(c.map(x => x.label)).toEqual([
      'commande modifiée', 'variable API_TOKEN désormais fournie au job', '/srv/a : propriétaire', '/srv/a : modifiable'])
  })

  it('ne montre rien quand la réparation est hors du champ des sondes', () => {
    const ctx = { user: 'app', path: '/usr/bin', loginPath: '/bin', loginOnlyVars: ['X'] }
    expect(contextDiff({ command: 'curl x', context: ctx }, { command: 'curl x', context: { ...ctx } })).toEqual([])
  })

  it("n'affirme pas qu'une variable est fournie si la sonde de connexion n'a pas tourné", () => {
    expect(contextDiff({ context: { loginPath: '/bin', loginOnlyVars: ['X'] } }, { context: {} })).toEqual([])
  })
})
