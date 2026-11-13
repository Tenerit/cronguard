// Labo terrain : récupère les questions tirées et leurs réponses (API publique StackExchange, sans clé).
import { readFileSync, writeFileSync } from 'fs'
const { order } = JSON.parse(readFileSync('eval/field-lab-draw.json', 'utf8'))
const strip = h => h.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '\n```\n$1\n```\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
const site = u => ({ 'stackoverflow.com': 'stackoverflow', 'serverfault.com': 'serverfault', 'unix.stackexchange.com': 'unix', 'askubuntu.com': 'askubuntu', 'superuser.com': 'superuser' })[new URL(u).host]
const out = []
const [FROM, TO, OUTF] = [Number(process.argv[2] ?? 70), Number(process.argv[3] ?? 80), process.argv[4] ?? "eval/field-lab-questions-5.json"]
for (const url of order.slice(FROM, TO)) {
  const id = url.match(/questions\/(\d+)/)[1], s = site(url)
  const q = await (await fetch(`https://api.stackexchange.com/2.3/questions/${id}?site=${s}&filter=withbody`)).json()
  const a = await (await fetch(`https://api.stackexchange.com/2.3/questions/${id}/answers?site=${s}&sort=votes&order=desc&filter=withbody&pagesize=3`)).json()
  const qq = q.items?.[0]; const answers = a.items ?? []
  const accepted = answers.find(x => x.is_accepted) ?? answers[0]
  out.push({ url, title: qq?.title, question: strip(qq?.body ?? '').slice(0, 2500), acceptedAnswer: accepted ? { accepted: !!accepted.is_accepted, score: accepted.score, body: strip(accepted.body).slice(0, 2000) } : null })
  await new Promise(r => setTimeout(r, 400))
}
writeFileSync(OUTF, JSON.stringify(out, null, 1))
console.log(out.map((x, i) => `${i}. ${x.title} — réponse ${x.acceptedAnswer ? (x.acceptedAnswer.accepted ? 'acceptée' : 'mieux notée') : 'AUCUNE'}`).join('\n'))
