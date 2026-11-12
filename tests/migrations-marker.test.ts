import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Une base marquée « schema_vN » ne rejoue plus les migrations : le marqueur DOIT suivre la dernière vN,
// sinon une nouvelle migration ne serait jamais appliquée sur une base existante.
describe('migrations — marqueur de schéma', () => {
  it('le marqueur porte le numéro de la dernière migration appelée', () => {
    const src = readFileSync(join(__dirname, '../src/db/migrations.ts'), 'utf8')
    const last = Math.max(...[...src.matchAll(/await v(\d+)\(client\)/g)].map(m => +m[1]))
    expect(src).toContain(`const SCHEMA_MARKER = 'schema_v${last}'`)
  })
})
