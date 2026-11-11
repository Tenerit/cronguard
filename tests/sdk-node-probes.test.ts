import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathProbe, loginProbe, failMarker, CronGuard } from '../sdk/node/cronguard'

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

describe('SDK Node : résolution constatée', () => {
  it("relance les vérifications à la première réussite après un échec, une seule fois", async () => {
    process.env.CG_STATE_DIR = mkdtempSync(join(tmpdir(), 'cg-state-'))
    process.env.CG_PROBE_LOGIN = '0'
    const sent: Array<Record<string, unknown>> = []
    const cg = new CronGuard('http://localhost:1')
    ;(cg as unknown as { ping: (k: string, b: Record<string, unknown>) => Promise<void> }).ping = async (_k, b) => { sent.push(b) }
    await cg.fail('job-1', { exitCode: 1, output: 'boot\ncat: data/input.csv: No such file or directory\nsecret=hunter2' })
    expect(readFileSync(failMarker('job-1'), 'utf8')).toBe('cat: data/input.csv: No such file or directory')   // seules les lignes des sondes
    await cg.success('job-1')
    await cg.success('job-1')
    expect(sent[1].context).toMatchObject({ paths: [{ path: 'data/input.csv' }] })
    expect(sent[2].context).toBeUndefined()
    delete process.env.CG_STATE_DIR; delete process.env.CG_PROBE_LOGIN
  })
})
