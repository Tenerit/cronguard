// Découpe github2-raw.json en ENTRAÎNEMENT / TEST, graine fixée avant lecture : 20261115. Tirage sur l'URL.
//   node eval/split-github.mjs
import { readFileSync, writeFileSync } from 'fs'
const raw = JSON.parse(readFileSync(new URL('./github2-raw.json', import.meta.url), 'utf8'))
let s = 20261115 >>> 0
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
const order = raw.map(x => x.url).sort().map(u => [rnd(), u]).sort((a, b) => a[0] - b[0]).map(x => x[1])
const half = Math.ceil(order.length / 2)
writeFileSync(new URL('./github2-split.json', import.meta.url), JSON.stringify({ seed: 20261115, train: order.slice(0, half), test: order.slice(half) }, null, 1))
console.log(`entraînement ${half} · test ${order.length - half}`)
