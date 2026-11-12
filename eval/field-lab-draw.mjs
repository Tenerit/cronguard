// Labo terrain — tirage des pannes (2026-11-12). Graine fixée AVANT de lire les questions : 20261112.
// Univers : les questions StackExchange derrière eval/crontab-lines*.json, moins celles des jeux qui ont réglé les fiches.
import { readFileSync, readdirSync, writeFileSync } from 'fs'
const lines = [...JSON.parse(readFileSync('eval/crontab-lines.json', 'utf8')), ...JSON.parse(readFileSync('eval/crontab-lines-2.json', 'utf8'))]
const qid = u => (u.match(/questions\/(\d+)/) || [])[1]
const used = new Set(readdirSync('eval').filter(f => /^public-cases.*\.ts$/.test(f)).flatMap(f => [...readFileSync('eval/' + f, 'utf8').matchAll(/questions\/(\d+)/g)].map(m => m[1])))
const pool = [...new Map(lines.filter(l => qid(l.source) && !used.has(qid(l.source))).map(l => [l.source, l])).keys()].sort()
let s = 20261112 >>> 0
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32   // LCG : reproductible, pas de choix humain
const shuffled = pool.map(u => [rnd(), u]).sort((a, b) => a[0] - b[0]).map(x => x[1])
writeFileSync('eval/field-lab-draw.json', JSON.stringify({ seed: 20261112, poolSize: pool.length, excludedUsedForTuning: used.size, order: shuffled }, null, 1))
console.log('univers', pool.length, '| écartées (déjà vues par les fiches)', [...new Set(lines.map(l => qid(l.source)))].filter(q => used.has(q)).length)
console.log(shuffled.slice(0, 16).join('\n'))
