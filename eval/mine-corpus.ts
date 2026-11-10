// Fouille du corpus de réglage : quelles pannes la bibliothèque ne reconnaît pas encore, regroupées
// par signature d'erreur (chemins, nombres et noms remplacés), les plus fréquentes d'abord.
//   npx tsx eval/mine-corpus.ts [top=40]
import { readFileSync } from 'fs'
import { join } from 'path'
import { knownFix } from '../src/services/llm/known-fixes'
import { toolCodeFinding } from '../src/services/llm/exit-codes'

const corpus: Array<{ url: string; title: string; logs: string; answer: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
const ERR = /error|denied|not found|failed|fatal|cannot|unable|unexpected|killed|no such|refused|expired|invalid|traceback|exception|not a tty/i
const sig = (l: string) => l.toLowerCase()
  .replace(/(\/[\w.@~-]+)+/g, '<path>').replace(/\b\d+\b/g, '<n>').replace(/'[^']*'|"[^"]*"/g, '<q>')
  .replace(/^[\w.<>-]*:?\s*(line <n>:\s*)?/, '').replace(/\s+/g, ' ').trim().slice(0, 90)

const covered = corpus.filter(c => knownFix(c.logs) || toolCodeFinding(c.logs))
const groups = new Map<string, typeof corpus>()
for (const c of corpus.filter(c => !covered.includes(c))) {
  const line = c.logs.split('\n').find(l => ERR.test(l)) ?? ''
  const k = sig(line)
  groups.set(k, [...(groups.get(k) ?? []), c])
}
console.log(`corpus ${corpus.length} · déjà couverts ${covered.length} (${Math.round(100 * covered.length / corpus.length)} %) · signatures non couvertes ${groups.size}\n`)
const top = Number(process.argv[2] ?? 40)
for (const [k, cs] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, top)) {
  console.log(`[${cs.length}] ${k}\n     ${cs[0].title.slice(0, 90)}\n     → ${cs[0].answer.slice(0, 200)}\n`)
}
