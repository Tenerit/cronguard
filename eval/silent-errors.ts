/**
 * « Réussi mais en erreur » — essai pré-enregistré (2026-11-12). Détecteur : eval/lib/silent-errors.ts (liste fixée).
 * Question : signaler un job sorti avec 0 dont la sortie contient une erreur forte, sans fausses alertes.
 *
 * Négatifs : sorties de 40 commandes cron courantes exécutées pour de vrai dans une Debian (eval/silent-errors/healthy.sh),
 *   seules celles sorties avec 0 comptent. Produites par les outils, pas écrites à la main.
 * Positifs : les journaux d'erreur réels des jeux publics StackExchange (eval/public-cases*.ts), quel que soit leur code.
 *
 * Attentes fixées AVANT de produire les négatifs :
 *   - fausses alertes sur les négatifs ≤ 2 %  → activé par défaut (le job est signalé en panne, code 0 + lignes trouvées) ;
 *     entre 2 et 5 % → seulement sur demande (CG_STRICT_OUTPUT=1) ; au-delà → abandonné ;
 *   - rappel sur les positifs : rapporté ; en dessous de 50 % l'idée ne vaut pas son risque, abandonnée quel que soit le reste.
 *   - liste figée : un marqueur retiré ou ajouté après la mesure est noté « après coup » et ne compte pas.
 *   npx tsx eval/silent-errors.ts        (Docker ; ~5 min la première fois)
 */
import { execFileSync } from 'child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { silentErrors } from './lib/silent-errors'

const OUT = resolve('eval/silent-errors/out')
if (!existsSync(join(OUT, 'df.rc'))) {
  mkdirSync(OUT, { recursive: true })
  execFileSync('docker', ['run', '--rm', '-v', `${resolve('eval/silent-errors')}:/lab:ro`, '-v', `${OUT}:/out`, 'debian:bookworm-slim', 'sh', '/lab/healthy.sh'], { stdio: 'inherit' })
}
const neg = readdirSync(OUT).filter(f => f.endsWith('.rc')).map(f => f.slice(0, -3))
  .map(n => ({ name: n, rc: Number(readFileSync(join(OUT, `${n}.rc`), 'utf8').trim()), out: readFileSync(join(OUT, `${n}.txt`), 'utf8') }))
const ok = neg.filter(x => x.rc === 0)
const falseAlarms = ok.map(x => ({ name: x.name, hits: silentErrors(x.out) })).filter(x => x.hits.length)

const pos: Array<{ name: string; logs: string }> = []
for (const f of readdirSync('eval').filter(f => /^public-cases.*\.ts$/.test(f))) {
  const src = readFileSync(join('eval', f), 'utf8')
  for (const m of src.matchAll(/name:\s*'([^']+)'[\s\S]*?logs:\s*`((?:\\`|[^`])*)`/g)) pos.push({ name: m[1], logs: m[2].replace(/\\`/g, '`') })
}
const caught = pos.filter(p => silentErrors(p.logs).length)
const result = {
  negatives: `${ok.length} sorties saines (code 0) sur ${neg.length} commandes`,
  falseAlarms: `${falseAlarms.length}/${ok.length} (${(100 * falseAlarms.length / Math.max(ok.length, 1)).toFixed(1)} %)`,
  recall: `${caught.length}/${pos.length} (${Math.round(100 * caught.length / Math.max(pos.length, 1))} %)`,
  falseAlarmDetail: falseAlarms, nonZeroCommands: neg.filter(x => x.rc !== 0).map(x => `${x.name}:${x.rc}`),
  missed: pos.filter(p => !silentErrors(p.logs).length).map(p => p.name),
}
writeFileSync('eval/silent-errors-results.json', JSON.stringify(result, null, 1))
console.log(JSON.stringify({ negatives: result.negatives, falseAlarms: result.falseAlarms, recall: result.recall, nonZero: result.nonZeroCommands }, null, 1))
for (const f of falseAlarms) console.log('fausse alerte :', f.name, '→', f.hits.map(h => `[${h.marker}] ${h.line}`).join(' | '))
