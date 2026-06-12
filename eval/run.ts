/**
 * Harness d'évaluation de l'analyseur LLM.
 *
 * Envoie chaque cas de eval/cases.ts à analyzeFailure et score :
 *   - catégorie : exact match (métrique principale)
 *   - sévérité  : exacte, et "proche" (±1 rang — low<medium<high<critical)
 *   - taux de réponses parsables (non-null)
 *
 * Prérequis : Redis + LLM joignables (mêmes variables d'env que l'app).
 *
 * Usage :
 *   npx tsx eval/run.ts               # les 26 cas
 *   npx tsx eval/run.ts --limit 5     # les 5 premiers (smoke test)
 *
 * Résultats : tableau console + eval/results.json
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { redis } from '../src/config/redis'
import { analyzeFailure, Severity } from '../src/services/llm/analyzer'
import { CASES } from './cases'

const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS || 120_000)

interface CaseResult {
  name:        string
  expected:    { category: string; severity: string }
  got:         { category: string; severity: string } | null
  categoryOk:  boolean
  severityOk:  boolean
  severityNear: boolean
  ms:          number
}

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : CASES.length
  const cases = CASES.slice(0, limit)

  // Run isolé : pas de cache partagé entre runs, breaker remis à zéro
  const runId = Date.now().toString(36)
  await redis.del('llm:circuit_breaker')

  console.log(`\nEval analyzer — ${cases.length} cas · modèle: ${process.env.LLM_MODEL || 'llama3.2:3b'} · timeout: ${TIMEOUT_MS}ms\n`)

  const results: CaseResult[] = []

  for (const [i, c] of cases.entries()) {
    const t0 = Date.now()
    const res = await analyzeFailure({
      jobName:  `eval-${runId}-${c.name}`,
      clientId: 'eval',
      monitorId: 'eval',
      exitCode: c.exitCode,
      env:      'production',
      logs:     c.logs,
    }, TIMEOUT_MS, { skipRateLimit: true })
    const ms = Date.now() - t0

    const got = res ? { category: res.category, severity: res.severity } : null
    const categoryOk   = got?.category === c.category
    const severityOk   = got?.severity === c.severity
    const severityNear = !!got && Math.abs(SEV_RANK[got.severity as Severity] - SEV_RANK[c.severity]) <= 1

    results.push({ name: c.name, expected: { category: c.category, severity: c.severity }, got, categoryOk, severityOk, severityNear, ms })

    const mark = !got ? '∅' : categoryOk ? '✓' : '✗'
    console.log(
      `${String(i + 1).padStart(2)}/${cases.length} ${mark} ${c.name.padEnd(28)} ` +
      `cat: ${c.category.padEnd(10)} → ${(got?.category ?? 'NULL').padEnd(10)} ` +
      `sev: ${c.severity.padEnd(8)} → ${(got?.severity ?? 'NULL').padEnd(8)} ${(ms / 1000).toFixed(1)}s`
    )
  }

  const answered  = results.filter(r => r.got)
  const catOk     = results.filter(r => r.categoryOk)
  const sevOk     = results.filter(r => r.severityOk)
  const sevNear   = results.filter(r => r.severityNear)
  const avgMs     = answered.length ? answered.reduce((s, r) => s + r.ms, 0) / answered.length : 0
  const pct = (n: number) => `${(100 * n / results.length).toFixed(0)}%`

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  Réponses parsables : ${answered.length}/${results.length}  (${pct(answered.length)})`)
  console.log(`  Catégorie exacte   : ${catOk.length}/${results.length}  (${pct(catOk.length)})   ← métrique principale`)
  console.log(`  Sévérité exacte    : ${sevOk.length}/${results.length}  (${pct(sevOk.length)})`)
  console.log(`  Sévérité ±1 rang   : ${sevNear.length}/${results.length}  (${pct(sevNear.length)})`)
  console.log(`  Latence moyenne    : ${(avgMs / 1000).toFixed(1)}s`)
  console.log('─'.repeat(64))

  const out = {
    date: new Date().toISOString(),
    model: process.env.LLM_MODEL || 'llama3.2:3b',
    cases: results.length,
    scores: {
      parsable:       answered.length / results.length,
      category_exact: catOk.length / results.length,
      severity_exact: sevOk.length / results.length,
      severity_near:  sevNear.length / results.length,
      avg_latency_ms: Math.round(avgMs),
    },
    results,
  }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 2))
  console.log(`  → eval/results.json\n`)

  await redis.quit()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
