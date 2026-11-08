/**
 * A/B apparié : la consigne « cause » demande-t-elle le POURQUOI plutôt que l'erreur recopiée ?
 *
 * PRÉ-ENREGISTRÉ le 2026-11-08, avant le premier appel au modèle (ne pas modifier après) :
 *   A = prompt actuel (analyzer.ts).
 *   B = même prompt, seule la consigne de « cause » change (VARIANT ci-dessous).
 *   Mesure principale : « cause profonde » sur les cas publics, regex ROOT par cas. Une regex
 *   qui trouve déjà une correspondance DANS LE LOG est écartée d'office : recopier le log ne
 *   doit pas suffire. Cas sans cause distincte du symptôme : ROOT = null, non comptés.
 *   Adoption de B seulement si TOUT est vrai :
 *     1. cause profonde : IC95 de la différence B−A (apparié cas×run) entièrement > 0 ;
 *     2. catégorie (labo + public) : différence moyenne ≥ −3 pts ET borne basse de l'IC > −10 pts ;
 *     3. identifiants absents des logs : hausse ≤ 5 pts ;
 *     4. 100 % de réponses parsables dans les deux bras.
 *   Les deux bras tournent dans la même session, ordre alterné par cas (A/B puis B/A).
 *
 *   npx tsx eval/ab-root-cause.ts --runs 3
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { CASES, EvalCase } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { FACTS, unverifiableIdentifiers } from './quality'

const OLD = `- "cause" : 1 phrase, ≤ 20 mots, cite la valeur EXACTE du log (pas de reformulation vague).`
const NEW = `- "cause" : 1 phrase, ≤ 20 mots : POURQUOI l'erreur s'est produite (le mécanisme), pas le message d'erreur recopié ; appuie-la sur une valeur exacte du log.`

const ROOT: Record<string, RegExp | null> = {
  'pub-pg-dump-version-mismatch-cron':      /ancien|older|antérieur|plus vieux|obsolète|inférieur|en retard|outdated|plus récent|newer/i,
  'pub-gitlab-backup-pg-dump-mismatch':     /ancien|older|antérieur|plus vieux|obsolète|inférieur|en retard|outdated|plus récent|newer/i,
  'pub-certbot-timeout-aaaa-old-provider':  /ipv6|aaaa/i,
  'pub-certbot-timeout-firewall-restarted': /\b80\b|\bport\b|http-01/i,
  'pub-mysqldump-lock-tables-privilege':    /privil|grant|droit/i,
  'pub-velero-x509-unknown-authority':      /\bca\b|autorit|cacert|ca-cert|auto-?sign|self-signed|confiance|trust/i,
  'pub-borg-not-found-cron-path':           /\bpath\b|\/usr\/local\/bin|chemin|environnement (du|de) cron/i,
  'pub-weaviate-x509-legacy-cn':            /\bsans?\b|subject alt/i,
  'pub-aws-s3-sync-sso-expired':            null,   // la cause EST le message (session SSO expirée)
  'pub-s3-upload-expired-token':            /\bsts\b|temporaire|temporary|durée|duration|session/i,
  'pub-node-heap-oom-backup':               /défaut|default|volume|taille|trop (gros|grand|volumineux)|max-old-space|NODE_OPTIONS/i,
}

const argVal = (f: string) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : undefined }
const RUNS = Number(argVal('--runs') ?? 3)

// Bras B = copie temporaire d'analyzer.ts avec la seule consigne changée (aucun code de prod touché).
const dir = join(__dirname, '../src/services/llm')
const src = readFileSync(join(dir, 'analyzer.ts'), 'utf8').replace(/\r\n/g, '\n')
if (!src.includes(OLD)) throw new Error('consigne de cause introuvable dans analyzer.ts : le pré-enregistrement ne correspond plus')
writeFileSync(join(dir, 'analyzer.abroot.ts'), src.replace(OLD, NEW))

type Row = { run: number; name: string; set: string; arm: 'A' | 'B'; ok: boolean; cat: boolean; root: boolean | null; inv: boolean; cause: string | null }

function meanCI(d: number[]): [number, number, number] {
  const n = d.length, m = d.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1))
  const h = 1.96 * sd / Math.sqrt(n)
  return [m, m - h, m + h]
}

async function main() {
  const { analyzeFailure: A } = await import('../src/services/llm/analyzer')
  const { analyzeFailure: B } = await import('../src/services/llm/analyzer.abroot')
  const { redis } = await import('../src/config/redis')
  const eligible = Object.entries(ROOT).filter(([n, re]) => re && !re.test(PUBLIC_CASES.find(c => c.name === n)!.logs)).map(([n]) => n)
  const excluded = Object.keys(ROOT).filter(n => !eligible.includes(n))
  console.log(`Cause profonde : ${eligible.length} cas éligibles ; écartés (regex dans le log ou null) : ${excluded.join(', ')}`)

  const all: Array<[string, EvalCase]> = [...CASES.map(c => ['lab', c] as [string, EvalCase]), ...PUBLIC_CASES.map(c => ['public', c] as [string, EvalCase])]
  const rows: Row[] = []
  for (let run = 0; run < RUNS; run++) {
    await redis.del('llm:circuit_breaker')
    for (const [k, [set, c]] of all.entries()) {
      const order: Array<'A' | 'B'> = (k + run) % 2 ? ['B', 'A'] : ['A', 'B']
      for (const arm of order) {
        const fn = arm === 'A' ? A : B
        const res = await fn({ jobName: `job-ab-${Date.now().toString(36)}-${arm}-${run}-${k}`, clientId: 'eval', monitorId: 'eval',
          exitCode: c.exitCode, env: 'production', logs: c.logs }, 120_000, { skipRateLimit: true })
        const re = set === 'public' && eligible.includes(c.name) ? ROOT[c.name] : null
        rows.push({ run, name: c.name, set, arm, ok: !!res, cat: res?.category === c.category,
          root: re ? !!res && re.test(res.cause) : null,
          inv: !!res && unverifiableIdentifiers(`${res.cause} ${res.action} ${res.checks.join(' ')}`, c.logs).length > 0,
          cause: res?.cause ?? null })
      }
      process.stdout.write('.')
    }
    console.log(` run ${run + 1}/${RUNS}`)
  }

  const pair = (pick: (r: Row) => boolean | null, filter: (r: Row) => boolean) => {
    const d: number[] = []
    for (const a of rows.filter(r => r.arm === 'A' && filter(r))) {
      const b = rows.find(r => r.arm === 'B' && r.run === a.run && r.name === a.name)!
      const va = pick(a), vb = pick(b)
      if (va === null || vb === null) continue
      d.push(Number(vb) - Number(va))
    }
    return d
  }
  const rate = (arm: string, pick: (r: Row) => boolean | null, filter: (r: Row) => boolean) => {
    const v = rows.filter(r => r.arm === arm && filter(r)).map(pick).filter(x => x !== null) as boolean[]
    return v.filter(Boolean).length / v.length
  }
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`
  const anyRow = () => true
  const [rm, rl, rh] = meanCI(pair(r => r.root, r => r.root !== null))
  const [cm, cl, ch] = meanCI(pair(r => r.cat, anyRow))
  const invA = rate('A', r => r.inv, anyRow), invB = rate('B', r => r.inv, anyRow)
  const okA = rate('A', r => r.ok, anyRow), okB = rate('B', r => r.ok, anyRow)
  const verdict = {
    root:     rl > 0,
    category: cm >= -0.03 && cl > -0.10,
    invented: invB - invA <= 0.05,
    parsable: okA === 1 && okB === 1,
  }
  const summary = {
    date: new Date().toISOString(), runs: RUNS, model: process.env.LLM_MODEL || 'llama3.2:3b', eligible, excluded,
    root_cause: { A: pct(rate('A', r => r.root, r => r.root !== null)), B: pct(rate('B', r => r.root, r => r.root !== null)), diff: pct(rm), ci95: [pct(rl), pct(rh)] },
    category:   { A: pct(rate('A', r => r.cat, anyRow)), B: pct(rate('B', r => r.cat, anyRow)), diff: pct(cm), ci95: [pct(cl), pct(ch)] },
    invented_identifiers: { A: pct(invA), B: pct(invB) },
    parsable: { A: pct(okA), B: pct(okB) },
    verdict, adopt_B: Object.values(verdict).every(Boolean),
  }
  console.log(JSON.stringify(summary, null, 2))
  writeFileSync(join(__dirname, 'results.ab-root-cause.json'), JSON.stringify({ summary, rows }, null, 2))
  await redis.quit()
}

main().catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => { try { unlinkSync(join(dir, 'analyzer.abroot.ts')) } catch { /* déjà supprimé */ } setTimeout(() => process.exit(), 500) })
