/**
 * Mesure instantanée de la connaissance déterministe (fiches, codes, faits constatés), SANS modèle :
 * en ~1 s au lieu de ~20 min pour score.ts. À lancer après chaque fiche ajoutée.
 *
 *   npm run eval:fiches
 *
 * Par jeu : couverture (une source déterministe répond), cause juste quand elle répond (critère
 * « mécanisme » de la grille), et RATÉS = elle répond mais à côté (une fiche qui se déclenche à
 * tort est pire que pas de fiche : elle remplace le modèle). Corpus : couverture seule (pas de label).
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { EvalCase } from './cases'
import { grade } from './rubric'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { KNOWN_FIX_COUNT } from '../src/services/llm/known-fixes'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'

process.env.LLM_ENABLED = 'false'
const SETS: Record<string, EvalCase[]> = { lab: CASES, public: PUBLIC_CASES, public2: PUBLIC2_CASES, public3: PUBLIC3_CASES, public4: PUBLIC4_CASES, public5: PUBLIC5_CASES }
const pct = (a: number, b: number) => b ? `${Math.round(100 * a / b)} %` : '—'

const misfires: string[] = []
console.log(`Fiches : ${KNOWN_FIX_COUNT}\n\njeu       cas  couverts  cause juste (si couvert)  ratés  note sans modèle`)
for (const [set, cases] of Object.entries(SETS)) {
  let cov = 0, right = 0, miss = 0, total = 0
  for (const c of cases) {
    const res = analysisWithoutModel({ logs: c.logs, exitCode: c.exitCode, command: c.command })
    const g = grade(c.name, c.category, c.logs, res)
    total += g.total
    if (!(res.finding || res.knownFix)) continue
    cov++
    if (g.mech > 0) right++
    else { miss++; misfires.push(`${set}/${c.name} ← ${res.finding ?? res.knownFix?.id} : ${res.cause.slice(0, 90)}`) }
  }
  console.log(`${set.padEnd(9)} ${String(cases.length).padStart(3)}  ${pct(cov, cases.length).padStart(8)}  ${pct(right, cov).padStart(24)}  ${String(miss).padStart(5)}  ${(total / cases.length).toFixed(1).padStart(16)}`)
}
const corpusFile = join(__dirname, 'corpus-raw.json')
if (existsSync(corpusFile)) {
  const corpus: Array<{ logs: string }> = JSON.parse(readFileSync(corpusFile, 'utf8'))
  const n = corpus.filter(c => { const r = analysisWithoutModel({ logs: c.logs }); return r.finding || r.knownFix }).length
  console.log(`corpus    ${String(corpus.length).padStart(3)}  ${pct(n, corpus.length).padStart(8)}  (réglage, pas de label)`)
}
console.log(misfires.length ? `\nRatés (la source répond à côté) :\n  ${misfires.join('\n  ')}` : '\nAucun raté.')
