// Règle CG_EXPECT APRÈS correction du défaut des dates (trouvé pendant l'essai pré-enregistré) : chiffre non indépendant.
//   npx tsx eval/expect-suggest-rule2.ts     (relit eval/expect-suggest-results.json, sans modèle)
import { readFileSync } from 'fs'
import { ruleExpect } from '../src/services/expect-suggest'

const r = JSON.parse(readFileSync('eval/expect-suggest-results.json', 'utf8'))
const L = [...JSON.parse(readFileSync('eval/crontab-lines.json', 'utf8')), ...JSON.parse(readFileSync('eval/crontab-lines-2.json', 'utf8'))]
const AMB = new Set([50, 75, 93, 94, 95, 96, 108, 137])
const GOLD: Record<number, string> = Object.fromEntries(
  r.rows.filter((x: { gold: string | null }) => x.gold).map((x: { i: number; gold: string }) => [x.i, x.gold]))

function matches(s: string, g: string): boolean {
  const sample = g.replace(/\*/g, '2026-11-12')
  const re = new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  const d = (p: string) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
  return re.test(sample) && d(s) === d(g)
}

let hit = 0, pos = 0, fneg = 0, neg = 0
L.forEach((x: { command: string }, i: number) => {
  if (AMB.has(i)) return
  const s = ruleExpect(x.command), g = GOLD[i]
  if (g) { pos++; if (s && matches(s, g)) hit++; else console.log('raté', i, s, g) }
  else { neg++; if (s) { fneg++; console.log('faux', i, s) } }
})
console.log(`règle corrigée : ${hit}/${pos} retrouvées, ${fneg}/${neg} fausses`)
