import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Garde-fous statiques sur le dashboard : la CSP bloque les scripts inline non hashés, mais une
// interpolation non échappée reste une injection HTML (faux formulaire, lien piégé) : on garde ces tests.
// Le dashboard est découpé (2026-11-12) : HTML + JS, lus ensemble.
const html = ['dashboard.html', 'dashboard.js'].map(f => readFileSync(join(__dirname, '../src/api', f), 'utf8')).join(String.fromCharCode(10))

describe('dashboard : échappement des champs saisis par un membre', () => {
  it("esc() échappe aussi l'apostrophe", () => {
    const src = /function esc\(s\) \{([\s\S]*?)\n\}/.exec(html)?.[1] ?? ''
    expect(src).toContain("&#39;")
  })

  it('data-args dynamiques toujours sérialisés en JSON puis échappés', () => {
    const dyn = html.match(/data-args="\$\{[^"]*"/g) ?? []
    expect(dyn.length).toBeGreaterThan(20)
    for (const a of dyn) expect(a).toMatch(/^data-args="\$\{esc\(JSON\.stringify\(\[/)
  })

  it("aucun texte échappé HTML n'est placé dans une chaîne JS d'attribut (décodé avant le JS)", () => {
    expect(html).not.toMatch(/on[a-z]+="[^"]*'\$\{esc\(/)
  })

  it.each(['m.env', 'm.schedule', 'm.name', 'm.notes', 'a.verified_fix', 'e.message'])(
    '%s jamais interpolé brut', (field) => {
      expect(html).not.toContain('${' + field + '}')
    })
})
