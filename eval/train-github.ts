// github — moitié ENTRAÎNEMENT : log extrait des blocs de code de l'issue, réponse de la connaissance déterministe.
// La moitié TEST n'est jamais affichée ici.   npx tsx eval/train-github.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
process.env.LLM_ENABLED = 'false'
type Issue = { url: string; title: string; body: string; stateReason: string; comments: Array<{ by: string; body: string }> }
const raw: Issue[] = JSON.parse(readFileSync(join(__dirname, 'github2-raw.json'), 'utf8'))
const { train } = JSON.parse(readFileSync(join(__dirname, 'github2-split.json'), 'utf8')) as { train: string[] }
const ERR = /error|denied|not found|fail|cannot|unable|no such|refused|exception|invalid|killed|traceback|fatal/i
export const logsOf = (body: string) => [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1]).filter(b => ERR.test(b)).join('\n---\n').slice(0, 1500)
train.forEach((u, i) => {
  const x = raw.find(r => r.url === u)!
  const logs = logsOf(x.body)
  const r = logs ? analysisWithoutModel({ logs, exitCode: 1 } as never) : null
  const fix = x.comments.filter(c => /OWNER|MEMBER|COLLABORATOR/.test(c.by)).map(c => c.body).join(' ').replace(/\s+/g, ' ').slice(0, 260)
  console.log(`#${i} [${x.stateReason}] ${x.title.slice(0, 80)}\n   ${u}\n   FICHE: ${r ? (r.finding ?? r.knownFix?.id ?? '—') + ' :: ' + r.cause.slice(0, 100) : '(pas de log)'}\n   LOG: ${logs.split('\n').filter(l => ERR.test(l)).slice(-2).join(' | ').slice(0, 220)}\n   MAINT: ${fix}`)
})
