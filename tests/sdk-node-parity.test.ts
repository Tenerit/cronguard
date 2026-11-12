// SDK Node : mêmes fonctions que bash/Python (masquage, file, empreinte, CG_EXPECT, étapes, chevauchement, réseau).
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import http from 'http'
import { AddressInfo } from 'net'
import { CronGuard, MASK_PATTERNS, maskSecrets, cgStep, netProbe, failMarker } from '../sdk/node/cronguard'

type Body = Record<string, any>
const got: Array<{ key: string; body: Body }> = []
const server = http.createServer((q, r) => {
  let b = ''
  q.on('data', d => b += d).on('end', () => { got.push({ key: q.url!.split('/').pop()!, body: JSON.parse(b) }); r.end('{}') })
})
const url = new Promise<string>(ok => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
afterAll(() => server.close())

beforeEach(() => {
  got.length = 0
  process.env.CG_STATE_DIR = mkdtempSync(join(tmpdir(), 'cg-node-'))
  process.env.CG_PROBE_LOGIN = '0'
  delete process.env.CG_EXPECT
})

describe('SDK Node : parité avec bash et Python', () => {
  it('liste de masquage identique à _CG_MASK (sdk/python)', () => {
    const py = readFileSync('sdk/python/cronguard.py', 'utf8')
    const block = py.slice(py.indexOf('_CG_MASK = ['), py.indexOf('\n]', py.indexOf('_CG_MASK = [')))
    const pats = [...block.matchAll(/r'((?:\\.|[^'\\])*)'/g)].map(m => m[1])
    expect(pats.length).toBeGreaterThan(25)
    expect(MASK_PATTERNS).toEqual(pats)
  })

  it('noms des champs attendus par le serveur (exit_code, duration_ms)', async () => {
    await new CronGuard(await url).fail('names', { exitCode: 2, durationMs: 1500, output: 'x' })
    expect(got[0].body).toMatchObject({ exit_code: 2, duration_ms: 1500 })
    expect(got[0].body).not.toHaveProperty('exitCode')
  })

  it('secrets masqués avant envoi', async () => {
    const cg = new CronGuard(await url)
    await cg.fail('mask', { exitCode: 1, output: 'connect postgres://app:S3cretPw@db/x failed\nAPI_TOKEN=abcd1234efgh' })
    const out = got[0].body.output as string
    expect(out).not.toContain('S3cretPw')
    expect(out).not.toContain('abcd1234efgh')
    expect(maskSecrets('password=hunter22')).toBe('password=[REDACTED]')
  })

  it('serveur coupé : pings gardés puis renvoyés dans l’ordre', async () => {
    const down = new CronGuard('http://127.0.0.1:1')
    for (const i of [1, 2, 3]) await down.fail('queue', { exitCode: 1, output: `run ${i}` })
    const q = join(process.env.CG_STATE_DIR!, 'queue')
    expect(readdirSync(q).filter(f => f.includes('__'))).toHaveLength(3)
    await new CronGuard(await url).success('queue')
    expect(got.map(g => g.body.output ?? g.body.status)).toEqual(['run 1', 'run 2', 'run 3', 'success'])
    expect(readdirSync(q).filter(f => f.includes('__'))).toHaveLength(0)
  })

  it('CG_EXPECT : réussi sans fichier attendu = échec code 0', async () => {
    process.env.CG_EXPECT = join(process.env.CG_STATE_DIR!, 'db-*.dump') + ' min=1k'
    await new CronGuard(await url).success('expect')
    expect(got[0].body).toMatchObject({ status: 'fail', exit_code: 0 })
    expect(got[0].body.context.expect[0]).toMatchObject({ ok: false, reason: 'absent' })
    writeFileSync(join(process.env.CG_STATE_DIR!, 'db-1.dump'), 'x'.repeat(2048))
    await new CronGuard(await url).success('expect')
    expect(got[1].body.status).toBe('success')
  })

  it('ce qui a changé depuis la dernière réussite (variable disparue)', async () => {
    process.env.CG_PARITY_VAR = '1'
    const cg = new CronGuard(await url)
    await cg.success('changed')
    delete process.env.CG_PARITY_VAR
    await cg.fail('changed', { exitCode: 1, output: 'boom' })
    expect(got[1].body.context.changed).toContainEqual({ kind: 'var', label: 'variable CG_PARITY_VAR absente depuis la dernière réussite' })
  })

  it('étapes et chevauchement dans le contexte de la panne', async () => {
    writeFileSync(failMarker('steps').slice(0, -5) + '.lock', `${process.ppid} 1700000000`)   // pid vivant : le parent
    const cg = new CronGuard(await url)
    await expect(cg.monitor('steps', async () => { cgStep('dump'); cgStep('upload'); throw new Error('upload failed: 403') })).rejects.toThrow()
    const ctx = got[0].body.context
    expect(ctx.steps.map((s: { name: string }) => s.name)).toEqual(['dump', 'upload'])
    expect(typeof ctx.stepsEnd).toBe('number')
    expect(ctx.overlap).toEqual({ pid: process.ppid, since: 1700000000 })
  })

  it('réseau : connexion refusée et nom introuvable établis', async () => {
    const r = await netProbe('Error: connect ECONNREFUSED 127.0.0.1:1\ngetaddrinfo ENOTFOUND nope.invalid')
    expect(r).toContainEqual({ host: '127.0.0.1', port: 1, dns: 'ok', tcp: 'refused' })
    expect(r).toContainEqual({ host: 'nope.invalid', port: 0, dns: 'fail' })
  })
})
