/**
 * Note /10 du diagnostic, calculée automatiquement (grille : eval/rubric.ts), et rapport à valider.
 *
 *   npx tsx eval/score.ts --set all --runs 3      # jeux de RÉGLAGE (labo, public, public2) → eval/REPORT.md
 *   npx tsx eval/score.ts --set final --runs 3    # + public3, le TEST FINAL : seulement pour la note finale
 *   npx tsx eval/score.ts --set all --runs 3 --ab LLM_KNOWLEDGE=off   # A/B apparié : A = réglage actuel, B = env modifié
 *   npx tsx eval/score.ts --validate                                # tamponne le dernier rapport comme validé
 *
 * Deux chiffres toujours ensemble : pannes couvertes par une correction connue / non couvertes
 * (le vrai test du modèle). Jeux : lab = réglage (dev), public = pannes publiques sourcées (test).
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { EvalCase } from './cases'
import { grade, Grade } from './rubric'

const argVal = (f: string) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : undefined }
const OUT_JSON = join(__dirname, 'report.json')
const OUT_MD   = join(__dirname, 'REPORT.md')

type Row = { run: number; arm: 'A' | 'B'; set: string; name: string; covered: boolean; g: Grade; cause: string | null; action: string | null; model: string | null; ms: number }

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)
function ci95(v: number[]): [number, number] {
  const m = mean(v), sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1))
  const h = 1.96 * sd / Math.sqrt(Math.max(1, v.length)); return [m - h, m + h]
}
const f1 = (x: number) => x.toFixed(1)
const pct = (x: number) => `${Math.round(100 * x)} %`

async function main() {
  if (process.argv.includes('--validate')) {
    const rep = JSON.parse(readFileSync(OUT_JSON, 'utf8'))
    rep.validated = { at: new Date().toISOString(), note: rep.summary.A.note }
    writeFileSync(OUT_JSON, JSON.stringify(rep, null, 2))
    writeFileSync(OUT_MD, readFileSync(OUT_MD, 'utf8').replace(/^> Validation : .*$/m, `> Validation : ✅ validé le ${rep.validated.at.slice(0, 10)}`))
    console.log(`Rapport validé (note ${rep.summary.A.note}/10).`); return
  }
  const set  = argVal('--set') ?? 'all'
  const runs = Number(argVal('--runs') ?? 3)
  const ab   = argVal('--ab')                              // ex. LLM_KNOWLEDGE=off
  const { CASES } = await import('./cases')
  const { PUBLIC_CASES } = await import('./public-cases')
  const { PUBLIC2_CASES } = await import('./public-cases-2')
  const { PUBLIC3_CASES } = await import('./public-cases-3')
  const { PUBLIC4_CASES } = await import('./public-cases-4')
  const cases: Array<[string, EvalCase]> = [
    ...(set === 'public' || set === 'public2' || set === 'public3' || set === 'public4' ? [] : CASES.map(c => ['lab', c] as [string, EvalCase])),
    ...(set === 'lab' || set === 'public2' || set === 'public3' || set === 'public4' ? [] : PUBLIC_CASES.map(c => ['public', c] as [string, EvalCase])),
    ...(set === 'all' || set === 'final' || set === 'public2' ? PUBLIC2_CASES.map(c => ['public2', c] as [string, EvalCase]) : []),
    // public3 = test final : seulement avec --set final (ou public3), jamais dans les expériences de réglage.
    ...(set === 'final' || set === 'public3' ? PUBLIC3_CASES.map(c => ['public3', c] as [string, EvalCase]) : []),
    ...(set === 'final' || set === 'public4' ? PUBLIC4_CASES.map(c => ['public4', c] as [string, EvalCase]) : []),
  ]
  const { analyzeFailure, analysisWithoutModel } = await import('../src/services/llm/analyzer')
  const { knownFix } = await import('../src/services/llm/known-fixes')
  const { redis } = await import('../src/config/redis')

  const [abKey, abVal] = ab ? ab.split('=') : []
  const before = abKey ? process.env[abKey] : undefined
  const arms: Array<'A' | 'B'> = ab ? ['A', 'B'] : ['A']
  const rows: Row[] = []
  for (let run = 0; run < runs; run++) {
    await redis.del('llm:circuit_breaker')
    for (const [k, [s, c]] of cases.entries()) {
      const order = (k + run) % 2 && ab ? [...arms].reverse() : arms     // ordre alterné : la dérive de session touche les deux bras
      for (const arm of order) {
        if (abKey) { if (arm === 'B') process.env[abKey] = abVal; else if (before === undefined) delete process.env[abKey]; else process.env[abKey] = before }
        const t0 = Date.now()
        const res = await analyzeFailure({ jobName: `job-${Date.now().toString(36)}-${arm}${run}-${k}`, clientId: 'eval', monitorId: 'eval',
          exitCode: c.exitCode, env: 'production', logs: c.logs, command: c.command }, 120_000, { skipRateLimit: true })
          // Comme le worker en production : LLM en panne ou réponse invalide → analyse sans modèle.
          ?? analysisWithoutModel({ logs: c.logs, exitCode: c.exitCode, command: c.command })
        rows.push({ run, arm, set: s, name: c.name, covered: !!knownFix(c.logs), g: grade(c.name, c.category, c.logs, res),
          cause: res?.cause ?? null, action: res?.action ?? null, model: res?.model ?? null, ms: Date.now() - t0 })
      }
      process.stdout.write('.')
    }
    console.log(` run ${run + 1}/${runs}`)
  }
  if (abKey) { if (before === undefined) delete process.env[abKey]; else process.env[abKey] = before }

  const summarize = (arm: 'A' | 'B') => {
    const r = rows.filter(x => x.arm === arm)
    const bySet = (name: string) => { const v = r.filter(x => x.set === name); return v.length ? f1(mean(v.map(x => x.g.total))) : '—' }
    const perRun = (filter: (x: Row) => boolean) => [...new Set(r.map(x => x.run))].map(run => mean(r.filter(x => x.run === run && filter(x)).map(x => x.g.total)))
    const all = perRun(() => true)
    return {
      note: f1(mean(r.map(x => x.g.total))), ci95: ci95(all).map(f1), runs: all.map(f1),
      covered:   { note: f1(mean(r.filter(x => x.covered).map(x => x.g.total))),  n: new Set(r.filter(x => x.covered).map(x => x.name)).size },
      uncovered: { note: f1(mean(r.filter(x => !x.covered).map(x => x.g.total))), n: new Set(r.filter(x => !x.covered).map(x => x.name)).size },
      lab: bySet('lab'), public: bySet('public'), public2: bySet('public2'), public3: bySet('public3'), public4: bySet('public4'),
      criteria: {
        cause_mecanisme: pct(mean(r.map(x => x.g.mech / 4))), action: pct(mean(r.map(x => x.g.act / 3))),
        categorie: pct(mean(r.map(x => x.g.cat))), rien_invente: pct(mean(r.map(x => x.g.noInvent))), preuve: pct(mean(r.map(x => x.g.evidence))),
      },
      latence_mediane_s: f1([...r.map(x => x.ms)].sort((a, b) => a - b)[Math.floor(r.length / 2)] / 1000),
      parsable: pct(mean(r.map(x => x.cause !== null ? 1 : 0))),
    }
  }
  const summary: Record<string, unknown> = { A: summarize('A') }
  if (ab) {
    summary.B = summarize('B')
    const d = rows.filter(x => x.arm === 'A').map(a => rows.find(b => b.arm === 'B' && b.run === a.run && b.name === a.name)!.g.total - a.g.total)
    summary.diff_B_moins_A = { note: f1(mean(d)), ci95: ci95(d).map(f1), variant: ab }
  }
  const report = { date: new Date().toISOString(), set, runs, model: process.env.LLM_MODEL || 'llama3.2:3b', summary, rows }
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  writeFileSync(OUT_MD, markdown(report, rows))
  console.log(JSON.stringify(summary, null, 2))
  await redis.quit()
}

function markdown(rep: { date: string; set: string; runs: number; model: string; summary: Record<string, any> }, rows: Row[]): string {
  const A = rep.summary.A
  const byCase = [...new Set(rows.map(r => r.name))].map(name => {
    const r = rows.filter(x => x.name === name && x.arm === 'A')
    const whys = r.flatMap(x => x.g.why); const top = [...new Set(whys)].sort((a, b) => whys.filter(w => w === b).length - whys.filter(w => w === a).length)
    return { name, set: r[0].set, covered: r[0].covered, note: mean(r.map(x => x.g.total)), why: top.slice(0, 2).join(' ; ') || '—', cause: r[0].cause ?? '—' }
  }).sort((a, b) => a.note - b.note)
  const ab = rep.summary.B ? `\n## A/B : ${rep.summary.diff_B_moins_A.variant}\n\n| | A (actuel) | B |\n|---|---|---|\n| Note | ${A.note} | ${rep.summary.B.note} |\n| Couvertes / non couvertes | ${A.covered.note} / ${A.uncovered.note} | ${rep.summary.B.covered.note} / ${rep.summary.B.uncovered.note} |\n| Cause = mécanisme | ${A.criteria.cause_mecanisme} | ${rep.summary.B.criteria.cause_mecanisme} |\n\nDifférence B − A : **${rep.summary.diff_B_moins_A.note}** (IC95 ${rep.summary.diff_B_moins_A.ci95.join(' à ')})\n` : ''
  return `# Note de l'IA CronGuard — ${A.note}/10

> Validation : ⏳ à valider — relire la note et les 5 pires cas, puis \`npx tsx eval/score.ts --validate\`

Mesuré le ${rep.date.slice(0, 10)} · modèle \`${rep.model}\` · ${rep.runs} run(s) · jeu \`${rep.set}\` · notation automatique (\`eval/rubric.ts\`).

| | Note /10 |
|---|---|
| **Globale** | **${A.note}** (IC95 ${A.ci95.join(' à ')}, runs ${A.runs.join(' · ')}) |
| Pannes couvertes par une correction connue (${A.covered.n} cas) | ${A.covered.note} |
| Pannes **non** couvertes (${A.uncovered.n} cas) — le vrai test du modèle | ${A.uncovered.note} |
| Jeu labo (réglage) / public (sourcé, vu avant le gel) | ${A.lab} / ${A.public} |
| Jeu public2 (collecté après le gel des fiches, puis lu : devenu réglage) | ${A.public2} |
| Jeu public3 (test du 2026-11-08 avant les leviers contexte / commande) | ${A.public3} |
| **Jeu public4 — TEST hors échantillon des leviers contexte / commande** | **${A.public4}** |

| Critère (poids) | Taux |
|---|---|
| Cause = le mécanisme (4) | ${A.criteria.cause_mecanisme} |
| Action juste et sûre (3) | ${A.criteria.action} |
| Catégorie (1) | ${A.criteria.categorie} |
| Rien d'inventé (1) | ${A.criteria.rien_invente} |
| Preuve liée (1) | ${A.criteria.preuve} |

Latence médiane ${A.latence_mediane_s} s · réponses parsables ${A.parsable}.
${ab}
## Par cas (pires d'abord, bras A)

| Cas | Jeu | Couvert | Note | Ce qui manque | Cause donnée |
|---|---|---|---|---|---|
${byCase.map(c => `| ${c.name} | ${c.set} | ${c.covered ? 'oui' : 'non'} | ${f1(c.note)} | ${c.why} | ${c.cause.replace(/\|/g, '/').slice(0, 90)} |`).join('\n')}
`
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => setTimeout(() => process.exit(), 300))
