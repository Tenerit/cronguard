// Analyse des erreurs du modèle (2026-11-10) : sur les pannes NON couvertes, pourquoi il se trompe, et ce
// qui distingue ses réussites. Source : réponses libres déjà produites (bras A des A/B nomodel, hyp, hyp2).
//   npx tsx eval/error-analysis.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { LABELS } from './rubric'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'

const ALL = [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES]
type Row = { arm: string; name: string; covered: boolean; model: string | null; cause: string | null; g: { mech: number; total: number } }
const rows: Row[] = ['report.nomodel.json', 'report.hyp.json', 'report.hyp2.json']
  .flatMap(f => (JSON.parse(readFileSync(join(__dirname, f), 'utf8')).rows as Row[]))
  .filter(r => r.arm === 'A' && !r.covered && r.model && !['knowledge', 'none', 'memory'].includes(r.model))

const kind = (r: Row) => r.g.mech > 0 ? 'JUSTE'
  : /^Cause non établie/.test(r.cause ?? '') ? 'abstention (symptôme recopié, détecté)'
  : 'FAUX (cause rédigée)'
const by = new Map<string, Row[]>()
for (const r of rows) by.set(r.name, [...(by.get(r.name) ?? []), r])

const tally: Record<string, number> = {}
for (const r of rows) tally[kind(r)] = (tally[kind(r)] ?? 0) + 1
console.log(`Réponses libres du modèle sur pannes non couvertes : ${rows.length}`, tally)

// Hypothèse : le modèle ne réussit que si le mécanisme est ÉCRIT dans les logs (il ne l'infère pas).
let inText = [0, 0], notInText = [0, 0]
console.log('\ncas | mécanisme écrit dans les logs ? | justes/réponses | réponses')
for (const [name, rs] of by) {
  const c = ALL.find(x => x.name === name)!
  const written = LABELS[name]?.mech.test(c.logs) ?? false
  const ok = rs.filter(r => r.g.mech > 0).length
  ;(written ? inText : notInText)[0] += ok; (written ? inText : notInText)[1] += rs.length
  const causes = [...new Set(rs.map(r => (r.cause ?? '').replace(/^Cause non établie.*/, '[abstention]').slice(0, 55)))]
  console.log(`${name.padEnd(32)} ${written ? 'OUI' : 'non'}  ${ok}/${rs.length}  ${causes.join(' ‖ ')}`)
}
console.log(`\nMécanisme écrit dans les logs : ${inText[0]}/${inText[1]} justes · non écrit (à déduire) : ${notInText[0]}/${notInText[1]} justes`)

// Le modèle recopie-t-il l'indice « type d'erreur » que le code met dans le prompt ?
import('../src/services/llm/analyzer').then(({ extractLogSignals }) => {
  const { sanitizeLogs } = require('../src/services/sanitizer')
  let parrot = 0, wrong = 0
  const hints: Record<string, number> = {}
  for (const r of rows) {
    const c = ALL.find(x => x.name === r.name)!
    const hint = extractLogSignals(sanitizeLogs(c.logs).clean).errorType
    if (r.g.mech > 0 || /^Cause non établie/.test(r.cause ?? '')) continue
    wrong++
    if (hint && (r.cause ?? '').toLowerCase().includes(hint.split(' ')[0])) { parrot++; hints[hint] = (hints[hint] ?? 0) + 1 }
  }
  console.log(`\nFausses causes rédigées : ${wrong} · reprennent l'indice « type d'erreur » du prompt : ${parrot}`, hints)
  const per = [...by.keys()].map(n => { const c = ALL.find(x => x.name === n)!; return `${n}: ${extractLogSignals(sanitizeLogs(c.logs).clean).errorType ?? '—'}` })
  console.log(per.join('\n'))
})

// L'extraction de lignes (extractLogSignals) retire-t-elle l'indice du mécanisme avant le modèle ?
import('../src/services/llm/analyzer').then(({ extractLogSignals }) => {
  const { sanitizeLogs } = require('../src/services/sanitizer')
  const lost: string[] = []
  for (const name of by.keys()) {
    const c = ALL.find(x => x.name === name)!, re = LABELS[name]?.mech
    const clean = sanitizeLogs(c.logs).clean
    if (re?.test(clean) && !re.test(extractLogSignals(clean).keyLines)) lost.push(name)
  }
  console.log(`\nIndice du mécanisme présent dans les logs mais RETIRÉ avant le modèle : ${lost.length} cas`, lost)
})
