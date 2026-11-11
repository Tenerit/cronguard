// Collecte du jeu NEUF de lignes de crontab pour l'essai 2 du nommage (2026-11-11). URLs de tous les jeux précédents
// exclues. Pour chaque requête et chaque site, les questions par pertinence ; on garde les lignes de crontab des blocs
// de code de la question, AU PLUS 4 par requête (diversité : sans plafond, la 1re requête donnait 62 lignes sur 90,
// presque toutes des sauvegardes). Arrêt à 90 lignes uniques. Pas de tri selon ce que l'IA ou le code réussirait.
//   node eval/collect-crontab-2.mjs
import { writeFileSync, readFileSync } from 'fs'

const QUERIES = [
  'crontab backup script', 'crontab mysqldump', 'crontab pg_dump', 'crontab rsync', 'crontab python script', 'crontab php script',
  'crontab node script', 'crontab curl url', 'crontab wget', 'crontab certbot renew', 'crontab logrotate', 'crontab docker exec',
  'crontab rake task', 'crontab laravel schedule', 'crontab django manage.py', 'crontab find delete old files', 'crontab tar archive',
  'crontab aws s3 sync', 'crontab weekdays only', 'crontab first day of month', 'crontab every 15 minutes', 'crontab git pull',
  'crontab java jar', 'crontab send email report', 'crontab clear cache', 'crontab restart service', 'crontab sql query',
  'crontab import csv', 'crontab generate report', 'crontab sitemap',
]
const SEEN = new Set(['public2-raw', 'public3-raw', 'public4-raw', 'public5-raw', 'public6-raw', 'public7-raw', 'corpus-raw']
  .flatMap(p => JSON.parse(readFileSync(new URL(`./${p}.json`, import.meta.url), 'utf8')).map(x => x.url).filter(Boolean)))
const PREV = new Set(JSON.parse(readFileSync(new URL('./crontab-lines.json', import.meta.url), 'utf8')).map(x => x.command.replace(/\s+/g, ' ')))
const SITES = ['stackoverflow', 'serverfault', 'unix', 'askubuntu']
const api = 'https://api.stackexchange.com/2.3'
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(u) { const r = await fetch(u); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { throw new Error('quota') } if (j.backoff) await sleep(j.backoff * 1000); return j }
const CRON = /^\s*((?:@(?:reboot|daily|hourly|weekly|monthly|midnight|yearly|annually))|(?:[\d*\/,-]+\s+){4}[\d*\/,A-Za-z-]+)\s+(\S.*)$/

const out = new Map()
outer: for (const q of QUERIES) {
  let perQuery = 0
  query: for (const site of SITES) {
    const res = await get(`${api}/search/advanced?order=desc&sort=relevance&site=${site}&pagesize=10&filter=withbody&q=${encodeURIComponent(q)}`)
    for (const it of res.items ?? []) {
      if (SEEN.has(it.link)) continue
      SEEN.add(it.link)
      for (const m of it.body.matchAll(/<code>([\s\S]*?)<\/code>/g)) for (const l of strip(m[1]).split('\n')) {
        const c = l.match(CRON)
        if (!c || c[2].length < 8 || /^[\d*\/,-]+$/.test(c[2])) continue
        const key = c[2].trim().replace(/\s+/g, ' ')
        if (PREV.has(key) || out.has(key)) continue
        out.set(key, { schedule: c[1].replace(/\s+/g, ' '), command: c[2].trim().slice(0, 300), source: it.link })
        if (out.size >= 90) break outer
        if (++perQuery >= 4) break query
      }
    }
    await sleep(300)
  }
  console.error(`${out.size} lignes après « ${q} »`)
}
writeFileSync(new URL('./crontab-lines-2.json', import.meta.url), JSON.stringify([...out.values()], null, 1))
console.error(`total : ${out.size}`)
