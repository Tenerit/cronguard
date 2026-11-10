import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathProbe, loginProbe } from '../sdk/node/cronguard'

const cwd = process.cwd()
afterEach(() => process.chdir(cwd))

describe('SDK Node : commandes de test (mêmes règles que bash/Python)', () => {
  it("chemin non cité (GNU) : le jeton entier, pas sa fin (« data/input.csv », pas « /input.csv »)", () => {
    process.chdir(mkdtempSync(join(tmpdir(), 'cg-probe-')))
    const out = pathProbe('cat: data/input.csv: No such file or directory')
    expect(out[0]).toMatchObject({ path: 'data/input.csv', relative: true, exists: false })
    expect(out.some(x => x.path === '/input.csv')).toBe(false)
  })
  it("fichier existant cité entre guillemets, et dossier parent d'un fichier à créer", () => {
    const d = mkdtempSync(join(tmpdir(), 'cg-probe-'))
    mkdirSync(join(d, 'archive')); writeFileSync(join(d, 'present.txt'), 'x')
    process.chdir(d)
    const out = pathProbe("cat: can't open 'present.txt': Permission denied\ntar: archive/x.tgz: Cannot open: Permission denied")
    expect(out.find(x => x.path === 'present.txt')).toMatchObject({ exists: true, readable: true })
    expect(out.find(x => x.path === 'archive/x.tgz')).toMatchObject({ exists: false })
    expect(out.find(x => x.path === 'archive')).toMatchObject({ exists: true })   // le parent porte les droits
  })
  it('lignes sans erreur de fichier : rien', () => {
    expect(pathProbe('ValueError: bad value')).toEqual([])
  })
  it('shell de connexion désactivable (CG_PROBE_LOGIN=0)', () => {
    process.env.CG_PROBE_LOGIN = '0'
    expect(loginProbe(['node'])).toEqual({})
    delete process.env.CG_PROBE_LOGIN
  })
})
