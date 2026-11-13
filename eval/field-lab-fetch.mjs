// Labo terrain : récupère les questions tirées et leurs réponses (API publique StackExchange, sans clé).
import { readFileSync, writeFileSync, existsSync } from 'fs'
const { order } = JSON.parse(readFileSync('eval/field-lab-draw.json', 'utf8'))
const strip = h => h.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '\n```\n$1\n```\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
const site = u => ({ 'stackoverflow.com': 'stackoverflow', 'serverfault.com': 'serverfault', 'unix.stackexchange.com': 'unix', 'askubuntu.com': 'askubuntu', 'superuser.com': 'superuser' })[new URL(u).host]
const [FROM, TO, OUTF] = [Number(process.argv[2] ?? 70), Number(process.argv[3] ?? 80), process.argv[4] ?? "eval/field-lab-questions-5.json"]
// Limite de débit (Cloudflare 1015, page HTML) : on attend et on réessaie ; reprise sur le fichier déjà écrit.
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(u) { for (let i = 0; i < 8; i++) { const t = await (await fetch(u)).text(); try { const j = JSON.parse(t); if (Array.isArray(j.items)) return j; if (j.backoff) await sleep(j.backoff * 1000) } catch { /* page HTML : bloqué */ } await sleep(60_000 * (i + 1)) } throw new Error('API bloquée') }
const out = existsSync(OUTF) ? JSON.parse(readFileSync(OUTF, 'utf8')) : []
for (const url of order.slice(FROM, TO).slice(out.length)) {
  const id = url.match(/questions\/(\d+)/)[1], s = site(url)
  const q = await get(`https://api.stackexchange.com/2.3/questions/${id}?site=${s}&filter=withbody`)
  await sleep(2000)
  const a = await get(`https://api.stackexchange.com/2.3/questions/${id}/answers?site=${s}&sort=votes&order=desc&filter=withbody&pagesize=3`)
  const qq = q.items?.[0]; const answers = a.items ?? []
  const accepted = answers.find(x => x.is_accepted) ?? answers[0]
  out.push({ url, title: qq?.title, question: strip(qq?.body ?? '').slice(0, 2500), acceptedAnswer: accepted ? { accepted: !!accepted.is_accepted, score: accepted.score, body: strip(accepted.body).slice(0, 2000) } : null })
  writeFileSync(OUTF, JSON.stringify(out, null, 1))
  await sleep(2000)
}
writeFileSync(OUTF, JSON.stringify(out, null, 1))
console.log(out.map((x, i) => `${i}. ${x.title} — réponse ${x.acceptedAnswer ? (x.acceptedAnswer.accepted ? 'acceptée' : 'mieux notée') : 'AUCUNE'}`).join('\n'))
