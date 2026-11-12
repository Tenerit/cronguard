// Le dashboard est servi tel quel (pas de build) : une seule erreur de syntaxe dans un de ses fichiers JS
// casse toute l'interface sans qu'aucun autre test ne le voie (apostrophe non échappée, 2026-11-12).
import { it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { Script } from 'vm'

it.each(['dashboard.js', 'dashboard-i18n.js'])('%s se compile', (f) => {
  expect(() => new Script(readFileSync(`src/api/${f}`, 'utf8'), { filename: f })).not.toThrow()
})
