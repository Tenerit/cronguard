// Collecte « github2 » (2026-11-13) : la v1 (github-raw.json) est ABANDONNÉE après lecture de sa moitié entraînement :
// la pertinence GitHub remontait surtout des tickets récents de projets pilotés par agents, sans log (46/60).
// v2 : issues créées avant 2025, avec un bloc de code, au moins 3 commentaires ; URLs de la v1 exclues (dont 60 lues).
// Requêtes figées AVANT lecture ; pour chacune, les 6 premières issues fermées (pertinence) avec au moins 2 commentaires.
// Pas de choix selon la couverture par une fiche. Ensuite : eval/split-github.mjs (graine fixée) → entraînement / test.
//   node eval/collect-github.mjs        (gh connecté ; recherche limitée à 30 req/min)
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const QUERIES = [
  'cron works manually', 'cronjob not working', 'crontab not running', 'cron job fails', 'runs from terminal but not from cron',
  'cron "command not found"', 'cron "No such file or directory"', 'cron "Permission denied"', 'cron environment variables',
  'cron PATH', 'crontab docker container', 'cron job exit code', 'cron backup script fails', 'cron "ModuleNotFoundError"',
  'cron "not a tty"', 'cron python script', 'cron node script', 'cron php script', 'cron ssh key', 'cron mysqldump',
]
const PER = 6
const OUT = new URL('./github2-raw.json', import.meta.url)
const gh = (...a) => JSON.parse(execFileSync('gh', ['api', '-X', 'GET', ...a], { encoding: 'utf8', maxBuffer: 1 << 24 }))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const seen = new Set([...out.map(x => x.url), ...JSON.parse(readFileSync(new URL('./github-raw.json', import.meta.url), 'utf8')).map(x => x.url)])
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
