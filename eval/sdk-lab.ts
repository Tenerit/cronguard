/**
 * Labo SDK (eval/sdk-lab/setup.sh) — attentes fixées AVANT le premier run (2026-11-11) :
 *
 * A. « Qu'est-ce qui a changé depuis la dernière réussite ? » (empreinte du SDK, comparée à l'échec)
 *    - 8 scénarios où un changement casse le job : le changement responsable est montré dans ≥ 7 sur 8 ;
 *    - 1 scénario sans changement (serveur distant tombé) : RIEN n'est montré ;
 *    - changements parasites (ni le responsable ni un autre changement réel du scénario) : ≤ 1 au total.
 * B. « Réussi mais rien produit » (CG_EXPECT)
 *    - 4 sorties non conformes (vide, pas récrite, absente, trop petite) + 1 en Python : échec avec la bonne raison, 5 sur 5,
 *      et le serveur établit la cause (constat ctx-expect) dans 5 sur 5 ;
 *    - 2 sorties conformes et 20 exécutions normales : 0 fausse alerte.
 *   npx tsx eval/sdk-lab.ts      (Docker requis, ~1 min)
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, copyFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

const CHANGES: Record<string, string> = {   // clé → sous-chaîne du libellé du changement responsable
  'tool-upgrade':       'version de pg_dump',
  'script-modified':    '/home/app/job.sh modifié',
  'var-removed':        'variable API_TOKEN absente',
  'path-changed':       'PATH',
  'command-changed':    'commande modifiée',
  'config-modified':    '/etc/app/app.conf modifié',
  'cwd-changed':        'dossier de lancement',
  'py-script-modified': '/home/app/pyjob.py modifié',
}
// Autres changements réels d'un scénario (pas parasites) : changer l'argument change aussi la commande, etc.
const ALSO: Record<string, string[]> = { 'command-changed': [], 'path-changed': [], 'cwd-changed': [] }
const EXPECT_BAD: Record<string, string> = { 'expect-empty': 'vide', 'expect-stale': 'pas modifié', 'expect-absent': 'absent',
  'expect-small': 'trop petit', 'py-expect-empty': 'vide' }

const lab = mkdtempSync(join(tmpdir(), 'cg-sdklab-'))
copyFileSync(join(__dirname, '..', 'sdk', 'bash', 'cronguard.sh'), join(lab, 'sdk.sh'))
copyFileSync(join(__dirname, '..', 'sdk', 'python', 'cronguard.py'), join(lab, 'sdk.py'))
copyFileSync(join(__dirname, 'sdk-lab', 'setup.sh'), join(lab, 'setup.sh'))
execFileSync('docker', ['run', '--rm', '--user', 'root', '--entrypoint', 'sh', '-v', `${lab}:/lab`,
  'cronguard-api:latest', '-c', "tr -d '\\r' < /lab/setup.sh > /tmp/s.sh && sh /tmp/s.sh"],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })

const out = join(lab, 'out')
type Ping = { status: string; exit_code?: number; output?: string; command?: string; context?: Record<string, unknown> }
const pings = (k: string): Ping[] => readdirSync(out).filter(f => f.startsWith(k + '-') && /^\d+\.json$/.test(f.slice(k.length + 1)))
  .sort((a, b) => parseInt(a.slice(k.length + 1)) - parseInt(b.slice(k.length + 1))).map(f => JSON.parse(readFileSync(join(out, f), 'utf8')))

let shown = 0, noise = 0
console.log('\nA. Ce qui a changé depuis la dernière réussite')
for (const [k, want] of Object.entries(CHANGES)) {
  const fail = pings(k).find(p => p.status === 'fail')
  const changed = ((fail?.context?.changed ?? []) as Array<{ label: string; before?: string; after?: string }>)
  const ok = changed.some(c => c.label.includes(want))
  const extra = changed.filter(c => !c.label.includes(want) && !(ALSO[k] ?? []).some(s => c.label.includes(s)))
  shown += +ok; noise += extra.length
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(19)} ${fail ? '' : '(aucun échec reçu)'}`)
  for (const c of changed) console.log(`    ${extra.includes(c) ? '⚠ parasite ' : ''}${c.label}${c.before !== undefined ? ` : ${c.before} → ${c.after}` : ''}`)
}
const nc = pings('no-change').find(p => p.status === 'fail')
const ncChanged = (nc?.context?.changed ?? []) as Array<{ label: string }>
noise += ncChanged.length
console.log(`${nc && !ncChanged.length ? '✓' : '✗'} no-change           ${nc ? ncChanged.map(c => c.label).join(' ; ') || 'rien montré' : '(aucun échec reçu)'}`)

console.log('\nB. Sorties attendues')
let bad = 0, cause = 0
for (const [k, reason] of Object.entries(EXPECT_BAD)) {
  const p = pings(k)[0]
  const exp = (p?.context?.expect ?? []) as Array<{ ok: boolean; reason?: string }>
  const ok = p?.status === 'fail' && exp.some(e => !e.ok && (e.reason ?? '').includes(reason))
  const a = p ? analysisWithoutModel({ logs: p.output ?? '', command: p.command, exitCode: p.exit_code, runContext: p.context as never }) : null
  const est = a?.finding === 'ctx-expect'
  bad += +ok; cause += +est
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(16)} ${p?.status ?? '—'} ${exp.map(e => e.reason).filter(Boolean).join(', ')}${est ? '' : '  (cause NON établie par le serveur)'}`)
}
const goods = ['expect-good', 'expect-glob', 'expect-normal'].flatMap(k => pings(k))
const falseAlarms = goods.filter(p => p.status !== 'success').length
console.log(`conformes : ${goods.length} exécutions, ${falseAlarms} fausse(s) alerte(s)`)

console.log(`\nA : responsable montré ${shown}/8 (attente ≥ 7) · sans changement : ${nc && !ncChanged.length ? 'rien montré ✓' : 'NON'} · parasites ${noise} (attente ≤ 1)`)
console.log(`B : non conformes détectées ${bad}/5 (attente 5) · cause établie ${cause}/5 (attente 5) · fausses alertes ${falseAlarms}/${goods.length} (attente 0 sur 22)`)
if (!existsSync(out)) console.log('Aucun ping capturé.')
