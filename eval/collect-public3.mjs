// Collecte du jeu de test « public3 » (2026-11-08), APRÈS les décisions prises en lisant public2
// (public2 devient un jeu de réglage). Même règle ; URLs déjà dans public2 exclues.
// Règle fixée avant de voir un résultat : pour chaque requête ci-dessous, dans l'ordre des sites,
// on garde le PREMIER résultat (tri par pertinence) qui a une réponse acceptée ET un bloc de code
// contenant une erreur. Pas de choix selon la couverture par une fiche. Sortie brute conservée
// dans eval/public2-raw.json (provenance). Un cas n'est écarté que si la réponse acceptée
// n'établit pas de cause (décision notée à la main dans public-cases-2.ts).
//   node eval/collect-public2.mjs
import { writeFileSync, readFileSync } from 'fs'

const QUERIES = [
  'crontab not running script', 'cron job fails silently', 'cron python script not working', 'cron shell script not executing',
  'cron backup script fails', 'cron php script not working', 'cron environment variables', 'cron sudo',
  'cron bash script works manually', 'cron mysql backup', 'cron postgresql backup', 'cron rsync ssh',
  'cron docker-compose', 'cron node script', 'cron java jar', 'cron wget', 'cron curl', 'cron scp', 'cron tar',
  'cron s3 sync', 'cron certbot renew', 'cron logrotate error', 'cron virtualenv', 'cron conda', 'cron Rscript',
  'cron perl', 'cron ffmpeg', 'cron git', 'cron systemctl', 'cron notify-send',
]
const SEEN = new Set(JSON.parse(readFileSync(new URL('./public2-raw.json', import.meta.url), 'utf8')).map(x => x.url))
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
      found = { query: q, site, title: strip(it.title), url: it.link, logs: codes.join('\n---\n').slice(0, 1500), answer: strip(a.items?.[0]?.body ?? '').replace(/\s+/g, ' ').slice(0, 700) }
      break
    }
    if (found) break
    await sleep(300)
  }
  out.push(found ?? { query: q, none: true })
  console.error(`${found ? '✓' : '·'} ${q}`)
}
writeFileSync(new URL('./public3-raw.json', import.meta.url), JSON.stringify(out, null, 2))
