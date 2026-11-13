// Collecte « github3 » (2026-11-13) : SCRIPTS de jobs qui marchent à la main mais pas sous cron (issues GitHub).
// But : mesurer ce que la lecture du code (script, commande) révèle de la cause. Mêmes filtres que github2 (avant 2025,
// bloc de code, 3+ commentaires) ; URLs de github et github2 exclues. Requêtes figées avant lecture.
// Requêtes figées AVANT lecture ; pour chacune, les 6 premières issues fermées (pertinence) avec au moins 2 commentaires.
// Pas de choix selon la couverture par une fiche. Ensuite : eval/split-github.mjs (graine fixée) → entraînement / test.
//   node eval/collect-github.mjs        (gh connecté ; recherche limitée à 30 req/min)
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const QUERIES = [
  'crontab "works fine" manually', 'cron "works fine" terminal', 'cron "run manually" works', 'cron "runs fine" manually',
  'crontab "not working" script', 'cron "does not work" script', "cron \"doesn't work\" script", 'cron "from the command line"',
  'crontab "from terminal"', 'cron "via crontab" fails', 'cron "in crontab" error', 'cron "when run from cron"',
  'cron "run by cron"', 'cron "executed by cron"', 'crontab "bash script"', 'crontab "python script"',
  'crontab "shell script"', 'cron "php script"', 'cron "node" script fails', 'crontab "docker exec"',
]
const PER = 8
const OUT = new URL('./github3-raw.json', import.meta.url)
const gh = (...a) => JSON.parse(execFileSync('gh', ['api', '-X', 'GET', ...a], { encoding: 'utf8', maxBuffer: 1 << 24 }))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const seen = new Set([...out.map(x => x.url), ...['./github-raw.json', './github2-raw.json'].flatMap(p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).map(x => x.url))])
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
