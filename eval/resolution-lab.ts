/**
 * Résolution constatée — la réparation se voit-elle dans le contexte relevé par le SDK ? (src/services/resolution.ts)
 * Labo cron réel (eval/cron-lab/setup.sh, phase 2) : 11 pannes, puis la réparation qu'un ops ferait, puis la
 * première réussite. On compare le contexte de l'échec et celui de la réussite.
 *
 * Attentes fixées AVANT le premier run (2026-11-11) :
 *   - cas justes ≥ 7/11 : le changement attendu (`want`) est présent ET aucun changement hors de `allow`
 *     (pour remote-down et app-bug, réparés hors du champ des sondes : AUCUN changement affiché) ;
 *   - changements parasites (ni `want` ni `allow`) : ≤ 1 au total sur les 11 cas.
 *
 *   npx tsx eval/resolution-lab.ts      (Docker requis, ~3 min)
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, copyFileSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { contextDiff, Change } from '../src/services/resolution'

// Chaque attendu = sous-chaîne du libellé d'un changement.
const EXPECTED: Record<string, { want: string[]; allow?: string[] }> = {
  'path-login':       { want: ['PATH'] },                                          // PATH fourni dans la crontab
  'env-missing':      { want: ['variable API_TOKEN'] },                             // variable fournie dans la crontab
  'relative-path':    { want: ['dossier de lancement'], allow: ['data/input.csv : existe'] },   // cd avant le job
  'permission':       { want: ['/srv/archive : modifiable'], allow: ['/srv/archive : propriétaire'] },   // chown
  'sh-not-bash':      { want: ['commande modifiée'] },                              // bash au lieu de sh
  'absent-file':      { want: ['/mnt/nas/export.csv : existe'], allow: ['/mnt/nas/export.csv : '] },     // montage revenu
  'remote-down':      { want: [] },                                                 // serveur distant relancé : invisible
  'app-bug':          { want: [] },                                                 // code corrigé : invisible
  'py-env-missing':   { want: ['variable WAREHOUSE_DSN'] },
  'py-relative-path': { want: ['dossier de lancement'], allow: ['data/input.csv : existe'] },
  'py-permission':    { want: ['/srv/archive : modifiable'], allow: ['/srv/archive : propriétaire'] },
}

const lab = mkdtempSync(join(tmpdir(), 'cg-reslab-'))
copyFileSync(join(__dirname, '..', 'sdk', 'bash', 'cronguard.sh'), join(lab, 'sdk.sh'))
copyFileSync(join(__dirname, 'cron-lab', 'setup.sh'), join(lab, 'setup.sh'))
copyFileSync(join(__dirname, '..', 'sdk', 'python', 'cronguard.py'), join(lab, 'sdk.py'))
writeFileSync(join(lab, 'phase2'), '')
console.log('Conteneur : vrai crond, 11 pannes puis 11 réparations… (~3 min)')
execFileSync('docker', ['run', '--rm', '--user', 'root', '--entrypoint', 'sh', '-v', `${lab}:/lab`,
  'cronguard-api:latest', '-c', "tr -d '\\r' < /lab/setup.sh > /tmp/s.sh && sh /tmp/s.sh"],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })

const out = join(lab, 'out')
const read = (f: string) => existsSync(join(out, f)) ? JSON.parse(readFileSync(join(out, f), 'utf8')) : null
let right = 0, noise = 0
const has = (c: Change[], s: string) => c.some(x => x.label.includes(s))
for (const [key, exp] of Object.entries(EXPECTED)) {
  const fail = read(`${key}.json`), ok = read(`${key}.ok.json`)
  if (!fail || !ok) { console.log(`✗ ${key.padEnd(17)} ${!fail ? 'aucun échec' : 'aucune réussite'} reçu`); continue }
  if (!ok.context) { console.log(`✗ ${key.padEnd(17)} réussite sans contexte`); continue }
  const changes = contextDiff(fail, ok)
  const extra = changes.filter(c => ![...exp.want, ...(exp.allow ?? [])].some(s => c.label.includes(s)))
  const good = exp.want.every(s => has(changes, s)) && !extra.length
  right += +good; noise += extra.length
  console.log(`${good ? '✓' : '✗'} ${key.padEnd(17)} ${changes.length ? '' : 'aucune différence'}`)
  for (const c of changes) console.log(`    ${extra.includes(c) ? '⚠ parasite ' : ''}${c.label}${c.before !== undefined ? ` : ${c.before} → ${c.after}` : ''}`)
}
console.log(`\nCas justes : ${right}/11 (attente ≥ 7) · changements parasites : ${noise} (attente ≤ 1)`)
console.log(readdirSync(out).length ? '' : 'Aucun ping capturé.')
