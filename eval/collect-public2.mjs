// Collecte du jeu de test « public2 » (2026-11-08), APRÈS le gel des fiches (commit 05beeb6).
// Règle fixée avant de voir un résultat : pour chaque requête ci-dessous, dans l'ordre des sites,
// on garde le PREMIER résultat (tri par pertinence) qui a une réponse acceptée ET un bloc de code
// contenant une erreur. Pas de choix selon la couverture par une fiche. Sortie brute conservée
// dans eval/public2-raw.json (provenance). Un cas n'est écarté que si la réponse acceptée
// n'établit pas de cause (décision notée à la main dans public-cases-2.ts).
//   node eval/collect-public2.mjs
import { writeFileSync } from 'fs'

const QUERIES = [
  'cron permission denied', 'cron no such file or directory', 'cron command not found', 'cron python ModuleNotFoundError',
  'cron not a tty', 'crontab syntax error', 'cron Host key verification failed', 'cron mysqldump error', 'cron pg_dump',
  'cron rsync error', 'cron No space left on device', 'cron Killed', 'cron curl certificate', 'cron Could not resolve host',
  'cron database is locked', 'cron cannot open display', 'cron UnicodeEncodeError', 'cron node Cannot find module',
  'cron php Allowed memory size', 'cron docker exec', 'cron gpg', 'cron aws s3 Unable to locate credentials',
  'cron selenium chromedriver', 'cron Segmentation fault', 'cron Connection refused', 'cron timeout',
  'cron Too many open files', 'cron wget ERROR 403', 'cron git pull Permission denied publickey', 'cron Read-only file system',
]
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
      if (!codes.length) continue
      const a = await get(`${api}/answers/${it.accepted_answer_id}?site=${site}&filter=withbody`)
      found = { query: q, site, title: strip(it.title), url: it.link, logs: codes.join('\n---\n').slice(0, 1500), answer: strip(a.items?.[0]?.body ?? '').replace(/\s+/g, ' ').slice(0, 700) }
      break
    }
    if (found) break
    await sleep(300)
  }
  out.push(found ?? { query: q, none: true })
  console.error(`${found ? '✓' : '·'} ${q}`)
}
writeFileSync(new URL('./public2-raw.json', import.meta.url), JSON.stringify(out, null, 2))
