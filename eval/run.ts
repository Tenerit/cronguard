/**
 * Harness d'évaluation de l'analyseur LLM.
 *
 * Score chaque cas via analyzeFailure :
 *   - catégorie : exact match (métrique principale)
 *   - sévérité  : exacte, et "proche" (±1 rang — low<medium<high<critical)
 *   - taux de réponses parsables (non-null)
 *
 * Mesure RIGOUREUSE (anti « benchmark de labo ») :
 *   - N exécutions → moyenne ± écart-type par métrique (variance du modèle).
 *   - Jeu indépendant de VRAIS logs via --set real (eval/real-cases.ts).
 *   - Verdict vs seuil (EVAL_THRESHOLD, défaut 0.75) sur la catégorie exacte.
 *
 * Prérequis : Redis + LLM joignables (mêmes variables d'env que l'app).
 *
 * Usage :
 *   npx tsx eval/run.ts                    # 1 run, jeu labo (eval/cases.ts)
 *   npx tsx eval/run.ts --runs 5           # 5 runs → moyenne ± écart-type
 *   npx tsx eval/run.ts --set real --runs 5  # 5 runs sur tes vrais logs
 *   npx tsx eval/run.ts --limit 5          # smoke test (5 premiers cas)
 *   LLM_RAW_LOGS=true npx tsx eval/run.ts --runs 5   # sans préprocessing regex
 *                                            (mesure modèle seul vs +regex)
 *
 * Résultats : tableau console + eval/results.json
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { redis } from '../src/config/redis'
import { analyzeFailure, Severity } from '../src/services/llm/analyzer'
import type { EvalCase } from './cases'

const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS || 120_000)
const THRESHOLD  = Number(process.env.EVAL_THRESHOLD || 0.75)

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

interface RunScore { parsable: number; category_exact: number; severity_exact: number; severity_near: number; avg_latency_ms: number; avg_tokens_in: number; avg_tokens_out: number }

async function loadCases(set: string): Promise<EvalCase[]> {
  if (set === 'real') {
    try {
      // specifier typé `string` (pas littéral) → TS ne tente pas de résoudre le module
      // au build (eval/real-cases.ts est gitignored / absent par défaut).
      const spec: string = './real-cases'
      const mod = await import(spec) as { REAL_CASES?: EvalCase[]; default?: EvalCase[] }
      const real = (mod.REAL_CASES ?? mod.default) as EvalCase[]
      if (!real?.length) throw new Error('REAL_CASES vide')
      return real
    } catch {
      console.error(
        '\n❌ --set real : eval/real-cases.ts introuvable ou vide.\n' +
        '   Copie eval/real-cases.example.ts → eval/real-cases.ts et colle ~20 VRAIS\n' +
        '   logs d\'incidents (anonymisés) avec leur catégorie/sévérité attendues.\n' +
        '   C\'est CE chiffre (pas le labo) qui valide le claim de précision.\n')
      process.exit(2)
    }
  }
  return (await import('./cases')).CASES
}

// Un run = un passage complet du jeu. runIdx rend le jobName (donc la clé de cache
// par empreinte) unique par run → vrais appels LLM à chaque run = variance réelle.
async function runOnce(cases: EvalCase[], runIdx: number): Promise<{ score: RunScore; perCase: Array<{ name: string; ok: boolean; got: string | null }> }> {
  await redis.del('llm:circuit_breaker')
  const tag = `${Date.now().toString(36)}-r${runIdx}`
  let parsable = 0, catOk = 0, sevOk = 0, sevNear = 0, msSum = 0, msN = 0
  let tokInSum = 0, tokOutSum = 0, tokN = 0
  const perCase: Array<{ name: string; ok: boolean; got: string | null }> = []

  for (const c of cases) {
    const t0 = Date.now()
    const res = await analyzeFailure(
      // Nom neutre : jobName entre dans le prompt, et c.name (« oom-killer-137 »…) soufflerait la catégorie attendue.
      { jobName: `job-${tag}-${cases.indexOf(c)}`, clientId: 'eval', monitorId: 'eval', exitCode: c.exitCode, env: 'production', logs: c.logs },
      TIMEOUT_MS, { skipRateLimit: true },
    )
    const ms = Date.now() - t0
    if (res) { parsable++; msSum += ms; msN++ }
    // Tokens réels rapportés par le provider (usage.prompt_tokens/completion_tokens).
    // Mesure le gain du template-mining : tokens_in ON vs OFF, à jeu de cas identique.
    if (typeof res?.tokensIn === 'number')  { tokInSum  += res.tokensIn;  tokN++ }
    if (typeof res?.tokensOut === 'number') { tokOutSum += res.tokensOut }
    const categoryOk = res?.category === c.category
    if (categoryOk) catOk++
    if (res?.severity === c.severity) sevOk++
    if (res && Math.abs(SEV_RANK[res.severity] - SEV_RANK[c.severity]) <= 1) sevNear++
    perCase.push({ name: c.name, ok: categoryOk, got: res?.category ?? null })
  }
  const n = cases.length
  return {
    score: {
      parsable: parsable / n, category_exact: catOk / n, severity_exact: sevOk / n,
      severity_near: sevNear / n, avg_latency_ms: msN ? Math.round(msSum / msN) : 0,
      avg_tokens_in:  tokN ? Math.round(tokInSum / tokN)  : 0,
      avg_tokens_out: tokN ? Math.round(tokOutSum / tokN) : 0,
    },
    perCase,
  }
}

function meanStd(xs: number[]): { mean: number; std: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const std  = xs.length > 1
    ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
    : 0
  return { mean, std }
}

async function main() {
  const set   = argVal('--set') ?? 'lab'
  const runs  = Math.max(1, Number(argVal('--runs') ?? 1))
  const limit = Number(argVal('--limit') ?? 0)
  let cases   = await loadCases(set)
  if (limit > 0) cases = cases.slice(0, limit)

  const BASELINE_MODEL = 'llama3.2:3b'   // le modèle produit (§6) ; porte le claim public
  const model   = process.env.LLM_MODEL || BASELINE_MODEL
  const rawMode = process.env.LLM_RAW_LOGS === 'true'
  console.log(`\nEval — set:${set} · ${cases.length} cas · ${runs} run(s) · modèle:${model}` +
    `${rawMode ? ' · RAW (sans regex)' : ''}\n`)

  const scores: RunScore[] = []
  for (let r = 1; r <= runs; r++) {
    const { score } = await runOnce(cases, r)
    scores.push(score)
    console.log(`  run ${r}/${runs} · cat ${(score.category_exact * 100).toFixed(0)}% · ` +
      `sev ${(score.severity_exact * 100).toFixed(0)}% · ±1 ${(score.severity_near * 100).toFixed(0)}% · ` +
      `parsable ${(score.parsable * 100).toFixed(0)}% · ${(score.avg_latency_ms / 1000).toFixed(1)}s · ` +
      `tok in/out ${score.avg_tokens_in}/${score.avg_tokens_out}`)
  }

  const agg = (k: keyof RunScore) => meanStd(scores.map(s => s[k]))
  const cat = agg('category_exact'), sev = agg('severity_exact'), near = agg('severity_near'), pars = agg('parsable')
  const tin = agg('avg_tokens_in'), tout = agg('avg_tokens_out'), lat = agg('avg_latency_ms')
  const fmt = (m: { mean: number; std: number }) => `${(m.mean * 100).toFixed(1)}% ± ${(m.std * 100).toFixed(1)}`
  const fmtN = (m: { mean: number; std: number }) => `${m.mean.toFixed(0)} ± ${m.std.toFixed(0)}`

  console.log(`\n${'─'.repeat(66)}`)
  console.log(`  Catégorie exacte : ${fmt(cat)}   ← métrique principale`)
  console.log(`  Sévérité exacte  : ${fmt(sev)}`)
  console.log(`  Sévérité ±1 rang : ${fmt(near)}`)
  console.log(`  Parsable         : ${fmt(pars)}`)
  console.log(`  Tokens in (moy)  : ${fmtN(tin)}   ← gain mining ON vs OFF`)
  console.log(`  Tokens out (moy) : ${fmtN(tout)}`)
  console.log(`  Latence moy (ms) : ${fmtN(lat)}`)
  const pass = cat.mean >= THRESHOLD
  console.log(`\n  Verdict : catégorie ${fmt(cat)} vs seuil ${(THRESHOLD * 100).toFixed(0)}% → ` +
    `${pass ? '✅ le claim TIENT' : '⚠️ SOUS le seuil → reformuler le claim'}`)
  if (set === 'lab') console.log('  ⚠️  Jeu LABO (fixtures maison). Le claim public exige --set real sur de VRAIS logs.')
  console.log('─'.repeat(66))

  const out = {
    date: new Date().toISOString(),
    set, runs, raw_mode: rawMode,
    model,
    cases: cases.length,
    threshold: THRESHOLD,
    passes_threshold: pass,
    template_mining: process.env.LLM_TEMPLATE_MINING !== 'false',
    aggregate: {
      category_exact: cat, severity_exact: sev, severity_near: near, parsable: pars,
      avg_tokens_in: tin, avg_tokens_out: tout, avg_latency_ms: lat,
    },
    per_run: scores,
  }
  // Un run sur un modèle non-baseline (comparaison) n'écrase PAS le results.json canonique
  // qui porte le claim commercial : il atterrit dans results.<modèle>.json, sauf --out explicite.
  const explicitOut = argVal('--out')
  const safeName    = `results.${model.replace(/[^a-z0-9._-]+/gi, '_')}.json`
  const outPath = explicitOut
    ? (path.isAbsolute(explicitOut) ? explicitOut : path.resolve(process.cwd(), explicitOut))
    : path.join(__dirname, model === BASELINE_MODEL ? 'results.json' : safeName)
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  const canonical = outPath === path.join(__dirname, 'results.json')
  console.log(`  → ${path.relative(process.cwd(), outPath)}${canonical ? '' : '  (comparaison — results.json canonique préservé)'}\n`)

  await redis.quit()
  process.exit(pass ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
