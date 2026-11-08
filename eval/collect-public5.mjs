// Collecte du jeu de test « public5 » (2026-11-08), AVANT d'écrire le levier 3 (codes officiels :
// codes de sortie, curl, rsync, errno) et le contrôle de commande à l'import. Même règle ; URLs de
// public2/3/4 exclues ; texte de la question gardé (commande recopiée, jamais d'inférence).
// Règle fixée avant de voir un résultat : pour chaque requête ci-dessous, dans l'ordre des sites,
// on garde le PREMIER résultat (tri par pertinence) qui a une réponse acceptée ET un bloc de code
// contenant une erreur. Pas de choix selon la couverture par une fiche. Sortie brute conservée
// dans eval/public2-raw.json (provenance). Un cas n'est écarté que si la réponse acceptée
// n'établit pas de cause (décision notée à la main dans public-cases-2.ts).
//   node eval/collect-public2.mjs
import { writeFileSync, readFileSync } from 'fs'

const QUERIES = [
  'cron exit status 127', 'cron exit code 126', 'cron exit status 1 grandchild', 'cron curl error', 'curl exit code cron',
  'rsync error code cron', 'rsync code 12 cron', 'cron job killed signal', 'cron job terminated', 'cron script exit code',
  'cron backup failed error', 'cron mysqldump error 2002', 'cron psql error', 'cron python error', 'cron php fatal error',
  'cron node error', 'cron bash error', 'cron shell script error message', 'cron ftp error', 'cron sftp error',
  'cron mail error', 'cron sendmail error', 'cron disk full', 'cron memory error', 'cron timeout error',
  'cron ssl error', 'cron dns error', 'cron connection refused error', 'cron lock file', 'cron flock',
]
const SEEN = new Set(['./public2-raw.json', './public3-raw.json', './public4-raw.json'].flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url)))
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
writeFileSync(new URL('./public5-raw.json', import.meta.url), JSON.stringify(out, null, 2))
