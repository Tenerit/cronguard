/**
 * Labo SDK, étape 5 (eval/sdk-lab-3/setup.sh) — attentes fixées AVANT le premier run (2026-11-12) :
 *  7. serveur coupé pendant 10 échecs puis rétabli : les 10 échecs arrivent, DANS L'ORDRE, avant la réussite suivante (10/10) ;
 *  8. chevauchement : signalé et établi (ctx-overlap) quand l'exécution précédente tourne ; avec CG_SKIP_IF_RUNNING=1,
 *     la commande n'est PAS lancée et l'exécution sautée est signalée — 2 sur 2 ;
 *  9. étapes : l'étape d'arrêt et la durée de l'étape précédente sont dites, en bash et en Python — 2 sur 2 ;
 * 10. doctor : ≥ 4 des 5 commandes à risque signalées (+ la version Python), et 0 signalement sur 3 commandes saines.
 *   npx tsx eval/sdk-lab-3.ts      (Docker requis)
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, copyFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { stepFact } from '../src/services/llm/run-context'

const lab = mkdtempSync(join(tmpdir(), 'cg-sdklab3-'))
copyFileSync(join(__dirname, '..', 'sdk', 'bash', 'cronguard.sh'), join(lab, 'sdk.sh'))
copyFileSync(join(__dirname, '..', 'sdk', 'python', 'cronguard.py'), join(lab, 'sdk.py'))
copyFileSync(join(__dirname, 'sdk-lab-3', 'setup.sh'), join(lab, 'setup.sh'))
execFileSync('docker', ['run', '--rm', '--user', 'root', '--entrypoint', 'sh', '-v', `${lab}:/lab`, 'cronguard-api:latest',
  '-c', "tr -d '\\r' < /lab/setup.sh > /tmp/s.sh && sh /tmp/s.sh"], { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })

const out = join(lab, 'out')
type Ping = { status: string; exit_code?: number; output?: string; command?: string; context?: Record<string, unknown> }
const all = readdirSync(out).filter(f => /^\d{3}-.+\.json$/.test(f)).sort().map(f => ({ key: f.slice(4, -5), p: JSON.parse(readFileSync(join(out, f), 'utf8')) as Ping }))
const of = (k: string) => all.filter(x => x.key === k).map(x => x.p)
const verdict = (p?: Ping) => p ? analysisWithoutModel({ logs: p.output ?? '', command: p.command, exitCode: p.exit_code, runContext: p.context as never }) : null

console.log('\n7. Pings jamais perdus')
const q = of('queue')
const order = q.map(p => (p.output ?? '').match(/run (\d+)/)?.[1] ?? (p.status === 'success' ? 'ok' : '?'))
const fails = q.filter(p => p.status === 'fail').length
const inOrder = order.slice(0, 10).join(',') === '1,2,3,4,5,6,7,8,9,10' && q[q.length - 1]?.status === 'success'
console.log(`${fails === 10 && inOrder ? '✓' : '✗'} ${fails}/10 échecs reçus · ordre : ${order.join(',')}`)

console.log('\n8. Chevauchement')
const ov = of('overlap').find(p => p.status === 'fail'); const ovv = verdict(ov)
const ov1 = ovv?.finding === 'ctx-overlap'
console.log(`${ov1 ? '✓' : '✗'} signalé : ${ovv?.finding ?? '—'} — ${ovv?.cause.slice(0, 110) ?? 'aucun ping'}`)
const sk = of('overlap-skip').find(p => p.status === 'fail'); const skv = verdict(sk)
const skipRan = existsSync(join(out, 'skip-ran.flag'))
const ov2 = skv?.finding === 'ctx-overlap' && /sautée/.test(sk?.output ?? '') && !skipRan
console.log(`${ov2 ? '✓' : '✗'} sauté : ${skv?.finding ?? '—'} · commande lancée : ${skipRan ? 'OUI' : 'non'} — ${(sk?.output ?? '').trim().slice(0, 100)}`)

console.log('\n9. Étapes')
let st = 0
for (const [k, last, before] of [['steps', 'upload', 'dump'], ['py-steps', 'load', 'extract']]) {
  const p = of(k).find(x => x.status === 'fail'); const f = stepFact(p?.context as never)
  const ok = !!f && f.includes(`« ${last} »`) && f.includes(`${before} : 1 s`); st += +ok
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(9)} ${f ?? 'aucune étape reçue'}`)
}

console.log('\n10. cronguard doctor')
const doc = (k: string) => existsSync(join(out, `doctor-${k}.txt`)) ? readFileSync(join(out, `doctor-${k}.txt`), 'utf8') : ''
let flagged = 0, falseFlags = 0
for (const k of ['bad-path', 'bad-var', 'bad-relative', 'bad-redirect', 'bad-percent']) {
  const t = doc(k); const ok = /^\s+- /m.test(t); flagged += +ok
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(13)} ${t.split('\n').find(l => l.trim().startsWith('-'))?.trim().slice(0, 110) ?? t.trim().slice(0, 80)}`)
}
for (const k of ['ok-ls', 'ok-abs', 'ok-env']) {
  const t = doc(k); const bad = /^\s+- /m.test(t); falseFlags += +bad
  console.log(`${bad ? '✗' : '✓'} ${k.padEnd(13)} ${bad ? t.trim().slice(0, 110) : 'rien à signaler'}`)
}
const py = /^\s+- /m.test(doc('py'))
console.log(`${py ? '✓' : '✗'} doctor Python  ${doc('py').split('\n').find(l => l.trim().startsWith('-'))?.trim().slice(0, 100) ?? doc('py').trim().slice(0, 80)}`)

console.log(`\n7 : ${fails}/10 dans l'ordre ${inOrder ? 'oui' : 'NON'} · 8 : ${+ov1 + +ov2}/2 · 9 : ${st}/2 · 10 : ${flagged}/5 signalées (≥ 4), ${falseFlags}/3 faux (0), Python ${py ? 'oui' : 'NON'}`)
