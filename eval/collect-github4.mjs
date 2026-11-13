// Collecte « github4 » (2026-11-13) : jeu NEUF pour le banc « inconnu » (eval/unknown-stress.ts), gelé avant lecture,
// mesuré une seule fois, sans découpe (tout est test). Requêtes différentes de github1-3, URLs déjà collectées exclues.
// Mêmes filtres que github2/3 : issues fermées, avant 2025, avec bloc de code, 3+ commentaires ; 8 par requête (pertinence).
//   node eval/collect-github4.mjs        (gh connecté ; recherche limitée à 30 req/min)
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const QUERIES = [
  'scheduled job error', 'cron task failed', 'cronjob error log', 'cron backup error', 'cron renew error',
  'cron sync fails', 'cron script error', 'cron import job fails', 'nightly job fails', 'cron cleanup fails',
  'cron "exit status"', 'cron "Traceback"', 'cron "Error:"', 'cron "failed with"', 'cron "FATAL"',
]
const PER = 8
const OUT = new URL('./github4-raw.json', import.meta.url)
const gh = (...a) => JSON.parse(execFileSync('gh', ['api', '-X', 'GET', ...a], { encoding: 'utf8', maxBuffer: 1 << 24 }))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const seen = new Set([...out.map(x => x.url), ...['./github-raw.json', './github2-raw.json', './github3-raw.json']
  .flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url))])
const done = new Set(out.map(x => x.query))
for (const q of QUERIES) {
  if (done.has(q)) continue
  const res = gh('search/issues', '-f', `q=${q} in:title,body is:issue is:closed comments:>2 created:<2025-01-01 "\`\`\`"`, '-f', 'per_page=30')
  let n = 0
  for (const it of res.items ?? []) {
    if (n >= PER) break
    if (seen.has(it.html_url) || it.pull_request) continue
    seen.add(it.html_url); n++
    const comments = gh(it.comments_url.replace('https://api.github.com/', ''), '-f', 'per_page=8')
      .map(c => ({ by: c.author_association, body: (c.body ?? '').slice(0, 1500) }))
    out.push({ query: q, url: it.html_url, title: it.title, stateReason: it.state_reason, body: (it.body ?? '').slice(0, 4000), comments })
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.error(`${n} · ${q}`)
  await sleep(2500)
}
console.log(out.length, 'issues')
