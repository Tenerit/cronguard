/**
 * Rôle de l'IA « questions pour enquêter » (src/services/llm/questions.ts) — attentes fixées AVANT le run :
 *   ≥ 1 question acceptée dans ≥ 70 % des cas · brutes sans identifiant inventé ≥ 95 % ·
 *   une question acceptée pointe la vraie cause ou la bonne vérification (regex mech/act de la grille) dans ≥ 30 % ·
 *   relecture humaine de 20 cas (eval/archive/QUESTIONS.md) : cause affirmée en douce ≤ 10 %, utile ≥ 70 % · médiane ≤ 20 s.
 * Cas : toutes les pannes étiquetées SANS cause établie par le code (labo, public à public7) — là où l'équipe enquête.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/questions.ts
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { questionsRaw, questionFacts } from '../src/services/llm/questions'
import { inventedIdentifiers } from '../src/services/llm/explain'
import { errorLines } from '../src/services/llm/evidence'
import { sanitizeLogs } from '../src/services/sanitizer'
import { LABELS } from './rubric'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'
import { PUBLIC6_CASES } from './public-cases-6'
import { PUBLIC7_CASES } from './public-cases-7'

process.env.LLM_ENABLED = process.env.LLM_ENABLED ?? 'true'
const ALL = [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES, ...PUBLIC6_CASES, ...PUBLIC7_CASES]
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0

;(async () => {
  const rows: Array<{ name: string; lines: string[]; raw: string[]; accepted: string[]; invented: number; points: boolean | null; ms: number }> = []
  for (const c of ALL) {
    const a = analysisWithoutModel({ logs: c.logs, exitCode: c.exitCode, command: c.command })
    if (a.finding || a.knownFix) continue
    const lines = errorLines(sanitizeLogs(c.logs).clean)
    const facts = questionFacts({ command: c.command, exitCode: c.exitCode, errorLines: lines })
    const t0 = Date.now()
    const r = await questionsRaw(facts, 120_000)
    const label = LABELS[c.name]
    const accepted = r?.accepted ?? []
    rows.push({ name: c.name, lines, raw: r?.raw ?? [], accepted, ms: Date.now() - t0,
      invented: (r?.raw ?? []).filter(q => inventedIdentifiers(q, facts).length).length,
      points: label ? accepted.some(q => label.mech.test(q) || label.act.test(q)) : null })
    process.stdout.write(accepted.length ? '.' : 'x')
  }
  const rawAll = rows.reduce((n, r) => n + r.raw.length, 0)
  const labeled = rows.filter(r => r.points !== null)
  const res = {
    cas: rows.length,
    avec_question: `${Math.round(100 * rows.filter(r => r.accepted.length).length / rows.length)} % (attente ≥ 70 %)`,
    brutes_sans_invention: `${Math.round(100 * (rawAll - rows.reduce((n, r) => n + r.invented, 0)) / Math.max(1, rawAll))} % de ${rawAll} (attente ≥ 95 %)`,
    pointe_la_cause: `${Math.round(100 * labeled.filter(r => r.points).length / Math.max(1, labeled.length))} % de ${labeled.length} étiquetés (attente ≥ 30 %)`,
    latence_mediane_s: `${(median(rows.map(r => r.ms)) / 1000).toFixed(1)} (attente ≤ 20)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'QUESTIONS.md'), `# Rôle IA — questions pour enquêter (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Cas (relecture humaine des 20 premiers)\n\n' +
    rows.map((r, i) => `### ${i + 1}. ${r.name}${r.points ? ' — pointe la cause' : ''}\n- Erreur : ${r.lines.slice(-2).join(' ⏎ ')}\n` +
      (r.accepted.length ? r.accepted.map(q => `- ✓ ${q}`).join('\n') : '- (aucune question acceptée)') +
      '\n' + r.raw.filter(q => !r.accepted.includes(q.trim().replace(/\s+/g, ' '))).map(q => `- ✗ ${q}`).join('\n') + '\n').join('\n'))
})()
