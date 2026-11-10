// Collecte du jeu de test « public6 » (2026-11-10), AVANT d'écrire le raisonnement par hypothèses
// (liste fermée de mécanismes, eval/hypotheses). Même règle que public2-5 ; URLs de public2-5 ET du
// corpus de réglage exclues. Règle fixée avant de voir un résultat : pour chaque requête, dans l'ordre
// des sites, on garde le PREMIER résultat (tri par pertinence) avec une réponse acceptée ET un bloc de
// code contenant une erreur. Pas de choix selon la couverture par une fiche.
//   node eval/collect-public6.mjs
import { writeFileSync, readFileSync } from 'fs'

const QUERIES = [
  'crontab works manually but not in cron', 'cron job environment variable not set', 'cron job command not found', 'cron script permission denied',
  'cron job python ModuleNotFoundError', 'cron job node not found', 'cron job ruby gem not found', 'cron job php warning',
  'cron job java exception', 'cron job docker exec error', 'cron job aws cli error', 'cron job git pull error',
  'cron job ssh host key verification failed', 'cron job scp error', 'cron job pg_dump error', 'cron job mongodump error',
  'cron job redis error', 'cron job wget error', 'cron job certbot renew error', 'cron job logrotate error',
  'cron job tar error', 'cron job zip error', 'cron job find error', 'cron job sed error',
  'cron job awk error', 'cron job date command error', 'cron job sudo error', 'cron job tty error',
  'cron job display error', 'cron job selenium error', 'cron job chrome headless error', 'cron job matplotlib error',
  'cron job pandas error', 'cron job encoding error', 'cron job locale error', 'cron job timezone wrong',
  'cron job database locked', 'cron job too many open files', 'cron job no space left on device', 'cron job read-only file system',
]
const SEEN = new Set(['./public2-raw.json', './public3-raw.json', './public4-raw.json', './public5-raw.json', './corpus-raw.json'].flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url)))
const SITES = ['stackoverflow', 'serverfault', 'askubuntu', 'unix']
const ERR = /error|denied|not found|failed|fatal|cannot|unable|unexpected|killed|no such|refused|expired|invalid|traceback|exception|not a tty|segmentation/i
const api = 'https://api.stackexchange.com/2.3'
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(u) { const r = await fetch(u); const j = await r.json(); if (j.backoff) await sleep(j.backoff * 1000); return j }

const out = []
for (const q of QUERIES) {
  let found = null
  for (const site of SITES) {
    const res = await get(`${api}/search/advanced?order=desc&sort=relevance&accepted=True&site=${site}&pagesize=30&filter=withbody&q=${encodeURIComponent(q)}`)
    for (const it of res.items ?? []) {
      const codes = [...it.body.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m => strip(m[1])).filter(c => c.length > 15 && ERR.test(c))
      if (!codes.length || SEEN.has(it.link)) continue
      SEEN.add(it.link)
      const a = await get(`${api}/answers/${it.accepted_answer_id}?site=${site}&filter=withbody`)
      found = { query: q, site, title: strip(it.title), url: it.link, logs: codes.join('\n---\n').slice(0, 1500), answer: strip(a.items?.[0]?.body ?? '').replace(/\s+/g, ' ').slice(0, 700), question: strip(it.body).slice(0, 4000) }
      break
    }
    if (found) break
    await sleep(300)
  }
  out.push(found ?? { query: q, none: true })
  console.error(`${found ? '✓' : '·'} ${q}`)
}
writeFileSync(new URL('./public6-raw.json', import.meta.url), JSON.stringify(out, null, 2))
