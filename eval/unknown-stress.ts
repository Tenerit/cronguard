/**
 * Banc d'essai « inconnu » (2026-11-13) : l'analyse sans modèle face à des textes qu'elle n'a jamais vus — issues GitHub
 * entières (corps + commentaires) : logs d'autres écosystèmes, code incomplet, JSON, langues, bruit.
 * Mesure : plantages, lenteur, et CHAQUE fiche/constat déclenché (avec sa ligne), à juger juste ou faux.
 * Chasse aux défauts sur les moitiés ENTRAÎNEMENT ; les moitiés TEST servent à mesurer le taux de fausses causes.
 *   npx tsx eval/unknown-stress.ts train|test
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { knownFixLine } from '../src/services/llm/known-fixes'

process.env.LLM_ENABLED = 'false'
//   npx tsx eval/unknown-stress.ts fresh   → github4 en entier (jeu neuf, gelé avant lecture, mesuré une fois)
const half = (process.argv[2] ?? 'train') as 'train' | 'test' | 'fresh'
type Issue = { url: string; title: string; body: string; comments: Array<{ body: string }> }
const texts: Array<{ src: string; title: string; text: string }> = []
for (const set of half === 'fresh' ? ['github4'] : ['github', 'github2', 'github3']) {
  const raw: Issue[] = JSON.parse(readFileSync(join(__dirname, `${set}-raw.json`), 'utf8'))
  // github (v1) n'a jamais servi à mesurer : entièrement en entraînement.
  const urls: string[] = set === 'github4' ? raw.map(r => r.url)
    : set === 'github' ? (half === 'train' ? raw.map(r => r.url) : [])
    : JSON.parse(readFileSync(join(__dirname, `${set}-split.json`), 'utf8'))[half]
  for (const u of urls) {
    const x = raw.find(r => r.url === u)!
    texts.push({ src: `${set}:${u.replace('https://github.com/', '')}`, title: x.title,
      text: [x.body, ...x.comments.map(c => c.body)].join('\n').replace(/\r\n/g, '\n').slice(0, 20_000) })
  }
}
let crashes = 0, slow = 0, fired = 0
for (const t of texts) {
  const t0 = performance.now()
  try {
    const r = analysisWithoutModel({ logs: t.text, exitCode: 1 } as never)
    const ms = performance.now() - t0
    if (ms > 200) { slow++; console.log(`LENT ${Math.round(ms)} ms  ${t.src}`) }
    const id = r.finding ?? r.knownFix?.id
    if (id) {
      fired++
      const line = (r.knownFix ? knownFixLine(t.text) : '') ?? ''
      console.log(`FICHE ${id}  ${t.src}\n   titre : ${t.title.slice(0, 90)}\n   ligne : ${line.slice(0, 160)}`)
    }
  } catch (e) { crashes++; console.log(`PLANTAGE ${t.src} : ${(e as Error).message}`) }
}
console.log(`\n${half} : ${texts.length} textes · plantages ${crashes} · lents (>200 ms) ${slow} · une fiche ou un constat répond ${fired}`)
