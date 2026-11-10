// Corpus de RÉGLAGE pour écrire des fiches (2026-11-10) : les questions les plus votées du tag cron
// sur 4 sites StackExchange, avec réponse acceptée et un bloc de code contenant une erreur.
// Jamais utilisé pour mesurer : les URLs du corpus seront exclues de tout jeu de test futur.
//   node eval/collect-corpus.mjs [pages=3]
import { readFileSync, writeFileSync, existsSync } from 'fs'

const PAGES = Number(process.argv[2] ?? 3)
const SITES = ['stackoverflow', 'serverfault', 'unix', 'askubuntu']
const ERR = /error|denied|not found|failed|fatal|cannot|unable|unexpected|killed|no such|refused|expired|invalid|traceback|exception|not a tty|segmentation/i
const api = 'https://api.stackexchange.com/2.3'
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(u) { const j = await (await fetch(u)).json(); if (j.backoff) await sleep(j.backoff * 1000); if (j.error_id) throw new Error(j.error_message); return j }

// URLs des jeux de test : jamais dans le corpus de réglage.
const testUrls = new Set(['public2', 'public3', 'public4', 'public5']
  .map(n => new URL(`./${n}-raw.json`, import.meta.url)).filter(u => existsSync(u))
  .flatMap(u => JSON.parse(readFileSync(u, 'utf8')).map(x => x.url)))

const out = []
let quota = null
for (const site of SITES) {
  for (let page = 1; page <= PAGES; page++) {
    const q = await get(`${api}/questions?order=desc&sort=votes&tagged=cron&site=${site}&pagesize=100&page=${page}&filter=withbody`)
    quota = q.quota_remaining
    const items = (q.items ?? []).filter(it => it.accepted_answer_id && !testUrls.has(it.link))
      .map(it => ({ it, codes: [...it.body.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m => strip(m[1])).filter(c => c.length > 15 && ERR.test(c)) }))
      .filter(x => x.codes.length)
    if (items.length) {
      const a = await get(`${api}/answers/${items.map(x => x.it.accepted_answer_id).join(';')}?site=${site}&pagesize=100&filter=withbody`)
      const byId = new Map((a.items ?? []).map(x => [x.answer_id, strip(x.body).replace(/\s+/g, ' ')]))
      for (const { it, codes } of items) out.push({ site, url: it.link, title: strip(it.title), score: it.score,
        logs: codes.join('\n---\n').slice(0, 2000), answer: (byId.get(it.accepted_answer_id) ?? '').slice(0, 900) })
    }
    if (!q.has_more) break
    await sleep(300)
  }
  console.error(`${site} : ${out.filter(x => x.site === site).length} questions`)
}
writeFileSync(new URL('./corpus-raw.json', import.meta.url), JSON.stringify(out, null, 2))
console.error(`total ${out.length} · quota restant ${quota}`)
