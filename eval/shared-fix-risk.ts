/**
 * Risque du partage des corrections entre jobs (src/services/llm/incident-memory.ts, recallVerifiedFix shared) :
 * une correction validée sur un job est proposée à un autre job dont la panne a la MÊME signature (ligne d'erreur
 * décisive normalisée). Si deux pannes DIFFÉRENTES partagent une signature, la correction de l'une serait servie à
 * l'autre. On le mesure sur des pannes toutes distinctes : les cas étiquetés (lab + public à public6) et le corpus.
 *   npx tsx eval/shared-fix-risk.ts
 * Attente fixée AVANT de lancer : au plus 5 % des pannes partagent leur signature avec une panne différente.
 * Le bénéfice (combien de pannes réelles reviennent sur un autre job) ne se mesure qu'avec de vraies équipes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { errorSignature } from '../src/services/llm/incident-memory'
import { sanitizeLogs } from '../src/services/sanitizer'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'
import { PUBLIC6_CASES } from './public-cases-6'

function measure(name: string, items: Array<{ id: string; logs: string }>) {
  const groups = new Map<string, string[]>()
  let noSig = 0
  for (const it of items) {
    const sig = errorSignature(sanitizeLogs(it.logs).clean)
    if (!sig) { noSig++; continue }
    groups.set(sig, [...(groups.get(sig) ?? []), it.id])
  }
  const shared = [...groups.entries()].filter(([, ids]) => ids.length > 1)
  const exposed = shared.reduce((n, [, ids]) => n + ids.length, 0)
  console.log(`${name.padEnd(16)} ${String(items.length).padStart(4)} pannes · ${String(exposed).padStart(3)} partagent leur signature avec une autre (${(100 * exposed / items.length).toFixed(1)} %, attente ≤ 5 %) · sans signature : ${noSig}`)
  for (const [sig, ids] of shared) console.log(`    « ${sig.slice(0, 90)} » ← ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? '…' : ''}`)
}

const labelled = [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES, ...PUBLIC6_CASES]
measure('cas étiquetés', labelled.map(c => ({ id: c.name, logs: c.logs })))
const corpus: Array<{ url: string; logs: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
measure('corpus', corpus.map(c => ({ id: c.url.split('/questions/')[1]?.split('/')[0] ?? c.url, logs: c.logs })))
