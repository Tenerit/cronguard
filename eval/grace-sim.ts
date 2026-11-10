/**
 * Mesure de la grâce apprise (src/workers/late.ts) par simulation, avec les VRAIES fonctions isLate / graceMs.
 *   npx tsx eval/grace-sim.ts
 *
 * Jobs horaires (cron « 0 * * * * », ping à la FIN du job), durées log-normales. Pour chaque profil de durée,
 * 30 exécutions d'historique (le p95 appris), puis 200 exécutions observées minute par minute :
 *   · fausse alerte = isLate() vrai pendant qu'un job normal tourne encore ;
 *   · retard de détection = minutes entre l'heure où le job aurait dû finir (planifié + grâce réglée) et
 *     l'alerte, quand l'exécution n'a jamais lieu.
 * Grâce effective plafonnée à l'intervalle du cron (ajouté après le 1er run : 61,6 min > 60 min pour le profil variable).
 * Attentes fixées AVANT de lancer : ≥ 90 % de fausses alertes en moins sur les jobs plus longs que leur grâce,
 * et un retard ajouté ≤ 1,2 × p95 de la durée.
 */
import { isLate, graceMs } from '../src/workers/late'

const MIN = 60_000, HOUR = 60 * MIN
let seed = 42
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
const logNormal = (median: number, sigma: number) => {
  const u = Math.max(rand(), 1e-9), v = rand()
  return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
}
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]

const PROFILES = [
  { name: 'court (2 min)',         median: 2 * MIN,  sigma: 0.3 },
  { name: 'moyen (8 min)',         median: 8 * MIN,  sigma: 0.4 },
  { name: 'long (20 min)',         median: 20 * MIN, sigma: 0.3 },
  { name: 'très variable (12 min)', median: 12 * MIN, sigma: 0.8 },
]
const GRACE_S = 300   // grâce réglée : 5 min (valeur par défaut)

console.log(`Grâce réglée ${GRACE_S / 60} min, jobs horaires, 200 exécutions par profil\n`)
console.log('profil                    p95     grâce apprise   fausses alertes : fixe → apprise   retard ajouté (absence)')
for (const P of PROFILES) {
  const history = Array.from({ length: 30 }, () => logNormal(P.median, P.sigma))
  const learned = { schedule: '0 * * * *', grace_period: GRACE_S, p95_ms: p95(history), dur_n: history.length }
  const fixed = { schedule: '0 * * * *', grace_period: GRACE_S }
  let falseFixed = 0, falseLearned = 0
  const t0 = Date.parse('2026-11-01T00:00:00Z')
  for (let k = 0; k < 200; k++) {
    const start = t0 + (k + 1) * HOUR, dur = logNormal(P.median, P.sigma), lastPing = start - HOUR + dur   // ping précédent : fin de l'exécution d'avant
    let fF = false, fL = false
    for (let t = start; t < start + dur; t += MIN) {   // pendant que le job tourne normalement
      if (isLate({ ...fixed, last_ping_at: new Date(lastPing) }, t)) fF = true
      if (isLate({ ...learned, last_ping_at: new Date(lastPing) }, t)) fL = true
    }
    falseFixed += +fF; falseLearned += +fL
  }
  const effective = Math.max(graceMs(fixed), Math.min(graceMs(learned), HOUR))   // plafond = intervalle du cron (horaire)
  const added = (effective - graceMs(fixed)) / MIN
  console.log(`${P.name.padEnd(24)} ${(p95(history) / MIN).toFixed(1).padStart(5)} min  ${(effective / MIN).toFixed(1).padStart(6)} min      ${String(falseFixed).padStart(3)} → ${String(falseLearned).padEnd(3)}  (${falseFixed ? Math.round(100 * (1 - falseLearned / falseFixed)) : 0} % en moins)     +${added.toFixed(1)} min (≤ 1,2 × p95 = ${(1.2 * p95(history) / MIN).toFixed(1)}, ≤ 60)`)
}
