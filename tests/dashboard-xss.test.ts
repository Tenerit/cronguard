import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Garde-fous statiques sur le dashboard : la CSP autorise les scripts inline (handlers onclick),
// donc une seule interpolation non échappée suffit à voler la clé API de l'owner.
const html = readFileSync(join(__dirname, '../src/api/dashboard.html'), 'utf8')

describe('dashboard : échappement des champs saisis par un membre', () => {
  it("esc() échappe aussi l'apostrophe", () => {
    const src = /function esc\(s\) \{([\s\S]*?)\n\}/.exec(html)?.[1] ?? ''
    expect(src).toContain("&#39;")
  })

  it("aucun texte échappé HTML n'est placé dans une chaîne JS d'attribut (décodé avant le JS)", () => {
    expect(html).not.toMatch(/on[a-z]+="[^"]*'\$\{esc\(/)
  })

  it.each(['m.env', 'm.schedule', 'm.name', 'm.notes', 'a.verified_fix', 'e.message'])(
    '%s jamais interpolé brut', (field) => {
      expect(html).not.toContain('${' + field + '}')
    })
})
