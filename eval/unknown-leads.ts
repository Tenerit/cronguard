// Banc « inconnu », mesure 2 : pistes typées (error-shape.ts) sur github4, textes où aucune fiche ne répond.
// Liste chaque piste (type annoncé + ligne) pour jugement « type juste ? ».   npx tsx eval/unknown-leads.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

process.env.LLM_ENABLED = 'false'
const raw: Array<{ url: string; body: string; comments: Array<{ body: string }> }> = JSON.parse(readFileSync(join(__dirname, 'github4-raw.json'), 'utf8'))
let n = 0, leads = 0
for (const x of raw) {
  const t = [x.body, ...x.comments.map(c => c.body)].join('\n').replace(/\r\n/g, '\n').slice(0, 20_000)
  const r = analysisWithoutModel({ logs: t, exitCode: 1 } as never)
  if (r.finding || r.knownFix) continue
  n++
  if (/^Cause précise non établie\. Type/.test(r.cause)) { leads++; console.log(`${leads}. ${r.cause.slice(41, 330)}`) }
}
console.log(`\n${n} textes sans fiche · ${leads} pistes typées`)
