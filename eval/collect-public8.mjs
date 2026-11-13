// Collecte « public8 » (2026-11-13), AVANT tout travail sur les fiches. Même règle que public7 : pour chaque requête,
// dans l'ordre des sites, PREMIER résultat (pertinence) avec réponse acceptée ET bloc de code contenant une erreur ;
// URLs de public2-7, du corpus et des labos terrain exclues. Pas de choix selon la couverture par une fiche.
// Ensuite eval/split-public8.mjs coupe le jeu en deux (graine fixée) : moitié ENTRAÎNEMENT (on règle les fiches dessus),
// moitié TEST (gelée, étiquetée avant le run, mesurée une seule fois).
//   node eval/collect-public8.mjs
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'

const QUERIES = [
  'crontab script works manually but not in cron', 'cron job command not found', 'cron environment variables not set', 'cron relative path not working',
  'cron python ModuleNotFoundError', 'cron python ImportError', 'cron node module not found', 'cron php fatal error',
  'cron permission denied', 'cron script cannot open file', 'cron bash syntax error', 'cron /bin/sh: 1: not found',
  'cron mysqldump error', 'cron pg_dump error', 'cron rsync error', 'cron scp error host key verification failed',
  'cron ssh connection refused', 'cron git pull error', 'cron aws cli error', 'cron docker exec error the input device is not a TTY',
  'cron selenium chrome error', 'cron display error', 'cron notify-send error', 'cron sudo error no tty present',
  'cron disk full no space left on device', 'cron too many open files', 'cron timeout error', 'cron database locked',
  'cron curl error could not resolve host', 'cron wget error', 'cron certificate verify failed', 'cron smtp error',
  'cron encoding error ascii codec', 'cron locale error', 'cron java exception', 'cron ruby error bundler',
  'cron perl error', 'cron laravel schedule error', 'cron magento cron error', 'cron django management command error',
  'cron ansible error', 'cron terraform error', 'cron kubernetes cronjob error', 'cron pm2 error',
  'cron tar error', 'cron zip error', 'cron find exec error', 'cron date format percent sign',
  'cron mail error', 'cron log rotation error', 'cron backup failed', 'cron crontab bad minute',
  'cron script exit code 1', 'cron script exit code 126', 'cron script exit code 127', 'cron script exit code 255',
  'cron pip error', 'cron conda activate error', 'cron r script error', 'cron powershell error',
]
const seen = ['./public2-raw.json', './public3-raw.json', './public4-raw.json', './public5-raw.json', './public6-raw.json', './public7-raw.json', './corpus-raw.json']
  .flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url))
const qid = u => (String(u).match(/questions\/(\d+)/) || [])[1]
const labIds = readdirSync(new URL('.', import.meta.url)).filter(f => /^field-lab-questions.*\.json$|^public-cases.*\.ts$/.test(f))
  .flatMap(f => [...readFileSync(new URL('./' + f, import.meta.url), 'utf8').matchAll(/questions\/(\d+)/g)].map(m => m[1]))
const SEEN = new Set(seen), SEEN_ID = new Set([...seen.map(qid), ...labIds].filter(Boolean))
const SITES = ['stackoverflow', 'serverfault', 'askubuntu', 'unix']
const ERR = /error|denied|not found|failed|fatal|cannot|unable|unexpected|killed|no such|refused|expired|invalid|traceback|exception|not a tty|segmentation/i
const api = 'https://api.stackexchange.com/2.3'
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(u) { const r = await fetch(u); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { throw new Error('quota') } if (j.backoff) await sleep(j.backoff * 1000); return j }
const OUT = new URL('./public8-raw.json', import.meta.url)

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []   // reprise : requêtes déjà faites gardées telles quelles
for (const x of out) if (x.url) { SEEN.add(x.url); SEEN_ID.add(qid(x.url)) }
for (const q of QUERIES.slice(out.length)) {
  let found = null
  for (const site of SITES) {
    const res = await get(`${api}/search/advanced?order=desc&sort=relevance&accepted=True&site=${site}&pagesize=30&filter=withbody&q=${encodeURIComponent(q)}`)
    for (const it of res.items ?? []) {
      const codes = [...it.body.matchAll(/<code>([\s\S]*?)<\/code>/g)].map(m => strip(m[1])).filter(c => c.length > 15 && ERR.test(c))
      if (!codes.length || SEEN.has(it.link) || SEEN_ID.has(String(it.question_id))) continue
      SEEN.add(it.link); SEEN_ID.add(String(it.question_id))
      const a = await get(`${api}/answers/${it.accepted_answer_id}?site=${site}&filter=withbody`)
      found = { query: q, site, title: strip(it.title), url: it.link, logs: codes.join('\n---\n').slice(0, 1500), answer: strip(a.items?.[0]?.body ?? '').replace(/\s+/g, ' ').slice(0, 900), question: strip(it.body).slice(0, 4000) }
      break
    }
    if (found) break
    await sleep(300)
  }
  out.push(found ?? { query: q, none: true })
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.error(`${found ? '✓' : '·'} ${q}`)
}
