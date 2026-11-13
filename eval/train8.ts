// public8 — moitié ENTRAÎNEMENT : ce que la connaissance déterministe (sans modèle) répond sur chaque cas.
// Sert à régler les fiches ; la moitié TEST n'est jamais affichée ici.   npx tsx eval/train8.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

process.env.LLM_ENABLED = 'false'
const raw: Array<{ url: string; title: string; logs: string }> = JSON.parse(readFileSync(join(__dirname, 'public8-raw.json'), 'utf8'))
const { train } = JSON.parse(readFileSync(join(__dirname, 'public8-split.json'), 'utf8')) as { train: string[] }
train.forEach((u, i) => {
  const x = raw.find(r => r.url === u)!
  const r = analysisWithoutModel({ logs: x.logs, exitCode: 1 } as never)
  console.log(`#${i} ${r.finding ?? r.knownFix?.id ?? '—'} :: ${r.cause.slice(0, 140)}`)
})
