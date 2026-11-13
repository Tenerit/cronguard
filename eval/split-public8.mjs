// Découpe public8 en ENTRAÎNEMENT / TEST, graine fixée avant lecture des questions : 20261113.
// Tirage sur l'URL (pas sur le contenu) : aucune décision humaine. Les requêtes sans résultat sont écartées.
//   node eval/split-public8.mjs
import { readFileSync, writeFileSync } from 'fs'
const raw = JSON.parse(readFileSync(new URL('./public8-raw.json', import.meta.url), 'utf8')).filter(x => x.url)
let s = 20261113 >>> 0
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
const order = raw.map(x => x.url).sort().map(u => [rnd(), u]).sort((a, b) => a[0] - b[0]).map(x => x[1])
const half = Math.ceil(order.length / 2)
writeFileSync(new URL('./public8-split.json', import.meta.url), JSON.stringify({ seed: 20261113, train: order.slice(0, half), test: order.slice(half) }, null, 1))
console.log(`entraînement ${half} · test ${order.length - half}`)
