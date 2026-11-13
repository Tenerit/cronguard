// Corpus de RÉGLAGE (eval/corpus-raw.json, 160 pannes, pas de label) : cas non couverts par une fiche, avec la dernière
// ligne d'erreur et le début de la réponse acceptée. Sert à repérer les familles de pannes à couvrir.   npx tsx eval/corpus-gaps.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
process.env.LLM_ENABLED = 'false'
const corpus: Array<{ url: string; title?: string; logs: string; answer: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
corpus.forEach((c, i) => {
  const r = analysisWithoutModel({ logs: c.logs, exitCode: 1 } as never)
  if (r.finding || r.knownFix) return
  const err = c.logs.split('\n').map(l => l.trim()).filter(l => /error|denied|not found|fail|cannot|unable|no such|refused|exception|invalid|killed/i.test(l)).slice(-2).join(' | ')
  console.log(`#${i} ${(c.title ?? '').slice(0, 70)}\n   LOG: ${err.slice(0, 220)}\n   ANS: ${c.answer.replace(/\s+/g, ' ').slice(0, 220)}`)
})
