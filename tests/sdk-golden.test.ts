// Cas dorés communs aux SDK (sdk/testdata/golden.json) : le bloc partagé bash/Python et le SDK Node rendent
// exactement la même chose (le binaire Go est vérifié par sdk/go/golden_test.go sur le même fichier).
// Dates des fichiers exclues de la comparaison : elles sont rendues dans le fuseau de la machine.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { maskSecrets, fingerprintDiff } from '../sdk/node/cronguard'

const golden = JSON.parse(readFileSync('sdk/testdata/golden.json', 'utf8'))
const comparable = (xs: Array<Record<string, string>>) => xs.map(x => x.kind === 'file' ? { kind: x.kind, label: x.label } : x)

function python(): string | null {
  for (const exe of ['python3', 'python']) if (spawnSync(exe, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)']).status === 0) return exe
  return null
}

describe('cas dorés : SDK Node', () => {
  for (const c of golden.mask) it(`masquage : ${c.in.slice(0, 40)}`, () => expect(maskSecrets(c.in)).toBe(c.out))
  for (const c of golden.fpdiff) it(`empreinte : ${c.name}`, () => expect(comparable(fingerprintDiff(c.old, c.new))).toEqual(comparable(c.out)))
})

describe('cas dorés : bloc partagé bash/Python', () => {
  const exe = python()
  it.skipIf(!exe)('mêmes sorties que golden.json', () => {
    const code = `
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
s = open('sdk/python/cronguard.py', encoding='utf-8').read()
g = {}
exec('import os, re, time, json, subprocess\\n' + s[s.index('# >>> cg-probes'):s.index('# <<< cg-probes')], g)
gold = json.load(open('sdk/testdata/golden.json', encoding='utf-8'))
print(json.dumps({'mask': [g['_cg_mask'](c['in']) for c in gold['mask']], 'fpdiff': [g['_cg_fp_diff'](c['old'], c['new']) for c in gold['fpdiff']]}))`
    const r = spawnSync(exe!, ['-I', '-c', code], { encoding: 'utf8', cwd: process.cwd() })
    expect(r.status, r.stderr).toBe(0)
    const got = JSON.parse(r.stdout)
    expect(got.mask).toEqual(golden.mask.map((c: { out: string }) => c.out))
    expect(got.fpdiff.map(comparable)).toEqual(golden.fpdiff.map((c: { out: Array<Record<string, string>> }) => comparable(c.out)))
  })
})
