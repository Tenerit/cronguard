/**
 * Labo de pannes cron RÉELLES : vrai crond (alpine), vrai utilisateur avec son ~/.profile, SDK bash, puis
 * analyse par le serveur SANS modèle (comportement par défaut), avec et sans les commandes de test du SDK.
 *
 *   npx tsx eval/cron-lab.ts          (Docker requis ; télécharge bash, python3, curl dans un conteneur jetable)
 *
 * Résultat attendu fixé AVANT de lancer : pour chaque panne, la cause établie (id du constat) ou, pour la
 * vraie erreur applicative, AUCUNE cause affirmée (« cause non établie » + commandes de test).
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, copyFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

const EXPECTED: Record<string, string[] | null> = {
  'path-login':    ['ctx-login-path'],      // outil ajouté au PATH par ~/.profile seulement
  'env-missing':   ['ctx-env-missing'],     // variable exportée par ~/.profile seulement
  'relative-path': ['ctx-relative-path'],   // chemin relatif au dossier du script, cron part du HOME
  'permission':    ['ctx-permission'],      // dossier de destination à root, job sous app
  'sh-not-bash':   ['ctx-sh-not-bash', 'cmd-bashism-sh'],   // syntaxe bash lancée par sh (2e id ajouté APRÈS le 1er run : même mécanisme, établi par la commande)
  'absent-file':   ['ctx-path-absent'],     // montage absent
  'remote-down':   ['curl-7'],              // rien n'écoute (code officiel curl)
  'app-bug':       null,                  // vraie erreur applicative : rien à affirmer
}

const lab = mkdtempSync(join(tmpdir(), 'cg-cronlab-'))
copyFileSync(join(__dirname, '..', 'sdk', 'bash', 'cronguard.sh'), join(lab, 'sdk.sh'))
copyFileSync(join(__dirname, 'cron-lab', 'setup.sh'), join(lab, 'setup.sh'))
console.log('Conteneur : vrai crond, 8 jobs en échec… (~1 à 2 min)')
execFileSync('docker', ['run', '--rm', '--user', 'root', '--entrypoint', 'sh', '-v', `${lab}:/lab`,
  'cronguard-api:latest', '-c', "tr -d '\\r' < /lab/setup.sh > /tmp/s.sh && sh /tmp/s.sh"],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })

type Ping = { output?: string; command?: string; exit_code?: number; context?: Record<string, unknown> }
const out = join(lab, 'out')
const pings: Record<string, Ping> = Object.fromEntries((existsSync(out) ? readdirSync(out) : [])
  .map(f => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(out, f), 'utf8'))]))

const verdict = (p: Ping, probes: boolean) => {
  const ctx = { ...(p.context ?? {}) }
  if (!probes) for (const k of ['loginPath', 'loginOnlyVars', 'loginFound', 'paths']) delete ctx[k]
  const a = analysisWithoutModel({ logs: p.output ?? '', command: p.command, exitCode: p.exit_code, runContext: ctx as never })
  return { id: a.finding ?? a.knownFix?.id ?? null, cause: a.cause, checks: a.checks }
}
let withP = 0, without = 0
for (const [key, want] of Object.entries(EXPECTED)) {
  const p = pings[key]
  if (!p) { console.log(`✗ ${key.padEnd(14)} aucun ping reçu`); continue }
  const a = verdict(p, true), b = verdict(p, false)
  const ok = (v: { id: string | null }) => want === null ? v.id === null : want.includes(v.id ?? '')
  withP += +ok(a); without += +ok(b)
  console.log(`${ok(a) ? '✓' : '✗'} ${key.padEnd(14)} attendu ${String(want).padEnd(18).slice(0, 18)} obtenu ${String(a.id).padEnd(18)} (sans sondes : ${b.id})`)
  console.log(`    ${a.cause.slice(0, 150)}`)
  if (!ok(a)) console.log(`    sortie : ${(p.output ?? '').replace(/\n/g, ' ⏎ ').slice(0, 200)}\n    contexte : ${JSON.stringify(p.context).slice(0, 400)}`)
}
console.log(`\nCause juste (ou abstention juste) : ${withP}/8 avec les commandes de test · ${without}/8 sans`)
