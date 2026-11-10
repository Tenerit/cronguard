// Collecte du jeu de test « public7 » (2026-11-10), AVANT de toucher à la précision des fiches. Même règle que public2-6 ;
// URLs de public2-6 et du corpus exclues. Pour chaque requête, dans l'ordre des sites, PREMIER résultat (pertinence)
// avec réponse acceptée ET bloc de code contenant une erreur. Pas de choix selon la couverture par une fiche.
//   node eval/collect-public7.mjs
import { writeFileSync, readFileSync, existsSync } from 'fs'

const QUERIES = [
  'cron job fails silently', 'cron job exit status 2', 'cron job segmentation fault', 'cron job killed', 'cron job out of memory',
  'cron job mysql access denied', 'cron job postgres connection refused', 'cron job ftp upload fails', 'cron job rsync permission denied', 'cron job ssh permission denied publickey',
  'cron job curl ssl certificate problem', 'cron job npm not found', 'cron job php not found', 'cron job python not found', 'cron job java not found',
  'cron job virtualenv not working', 'cron job conda environment', 'cron job docker not found', 'cron job kubectl error', 'cron job gcloud error',
  'cron job s3 upload error', 'cron job backup script error', 'cron job mail not sent', 'cron job file not created', 'cron job output empty',
  'cron job unicode error', 'cron job lock file exists', 'cron job duplicate runs', 'cron job systemd timer failed', 'cron job windows line endings',
  'cron job bad interpreter', 'cron job no such file or directory', 'cron job operation not permitted', 'cron job syntax error unexpected', 'cron job keyring error',
  'cron job gpg error', 'cron job xvfb', 'cron job memory limit php', 'cron job wp-cron error', 'cron job artisan schedule error',
]
const SEEN = new Set(['./public2-raw.json', './public3-raw.json', './public4-raw.json', './public5-raw.json', './public6-raw.json', './corpus-raw.json'].flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url)))
const SITES = ['stackoverflow', 'serverfault', 'askubuntu', 'unix']
const ERR = /error|denied|not found|failed|fatal|cannot|unable|unexpected|killed|no such|refused|expired|invalid|traceback|exception|not a tty|segmentation/i
const api = 'https://api.stackexchange.com/2.3'
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sleep = ms => new Promise(r => setTimeout(r, ms))
// Quota StackExchange (page HTML au lieu de JSON) : on s'arrête proprement, la collecte reprend au prochain lancement.
async function get(u) { const r = await fetch(u); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { throw new Error('quota') } if (j.backoff) await sleep(j.backoff * 1000); return j }
const OUT = new URL('./public7-raw.json', import.meta.url)

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []   // reprise : requêtes déjà faites gardées telles quelles
for (const x of out) if (x.url) SEEN.add(x.url)
for (const q of QUERIES.slice(out.length)) {
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
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.error(`${found ? '✓' : '·'} ${q}`)
}
writeFileSync(new URL('./public7-raw.json', import.meta.url), JSON.stringify(out, null, 2))
