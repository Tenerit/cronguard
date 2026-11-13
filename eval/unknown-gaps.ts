/**
 * Boucle « inconnu → connu » (2026-11-13) : regroupe en FAMILLES les lignes d'erreur qu'aucune source déterministe ne
 * reconnaît, sur toutes les données d'ENTRAÎNEMENT (StackExchange : corpus, public8 entraînement ; GitHub : github,
 * github2/3 ; les moitiés test github2/3 sont déjà consommées). Classées par nombre de textes distincts : les familles qui
 * reviennent sont les prochaines fiches. Jamais lus ici : github4 (banc neuf), public7/public8 test, les labos terrain.
 *   npx tsx eval/unknown-gaps.ts [min=2]
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

process.env.LLM_ENABLED = 'false'
const MIN = Number(process.argv[2] ?? 2)
const J = (f: string) => JSON.parse(readFileSync(join(__dirname, f), 'utf8'))
type Gh = { url: string; body: string; comments: Array<{ body: string }> }
const texts: Array<{ src: string; text: string }> = []
for (const c of J('corpus-raw.json') as Array<{ url: string; logs: string }>) texts.push({ src: c.url, text: c.logs })
{
  const raw: Array<{ url: string; logs: string }> = J('public8-raw.json'), { train } = J('public8-split.json')
  for (const u of train) { const x = raw.find(r => r.url === u); if (x) texts.push({ src: u, text: x.logs }) }
}
for (const set of ['github', 'github2', 'github3']) {
  const raw: Gh[] = J(`${set}-raw.json`)
  for (const x of raw) texts.push({ src: x.url, text: [x.body, ...x.comments.map(c => c.body)].join('\n').replace(/\r\n/g, '\n').slice(0, 20_000) })
}

const ERROR = /\b(error|errno|denied|not found|failed|failure|fatal|cannot|can't|unable|no such|refused|exception|invalid|killed|timed out|traceback|panic|abort)/i
/** Forme d'une ligne d'erreur : préfixes (date, hôte, fichier:ligne) retirés, valeurs variables remplacées. */
export function shape(line: string): string {
  return line
    .replace(/^[\s>*`|-]+/, '')
    .replace(/^\[?\d{4}-\d\d-\d\d[T ][\d:.,]+\S*\]?\s*/, '')
    .replace(/^\w{3}\s+\d+\s+[\d:]+\s+\S+\s+[\w./-]+(\[\d+\])?:\s*/, '')           // syslog
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(['"`‘’“”])[^'"`‘’“”\n]{1,120}\1/g, '<q>')
    .replace(/(?:~|\.{0,2})?\/[\w.@+~-]+(?:\/[\w.@+~-]*)*/g, '<path>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b\d+(?:[.:]\d+)*\b/g, '<n>')
    .replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 90)
}

const fam = new Map<string, { n: Set<string>; ex: string[] }>()
for (const t of texts) {
  const r = analysisWithoutModel({ logs: t.text, exitCode: 1 } as never)
  if (r.finding || r.knownFix) continue
  const lines = [...new Set(t.text.split('\n').map(l => l.trim()).filter(l => l.length > 12 && l.length < 400 && ERROR.test(l)))].slice(-4)
  for (const l of lines) {
    const s = shape(l)
    if (s.length < 12) continue
    const f = fam.get(s) ?? { n: new Set<string>(), ex: [] }
    f.n.add(t.src); if (f.ex.length < 2) f.ex.push(l.slice(0, 180))
    fam.set(s, f)
  }
}
const top = [...fam.entries()].filter(([, f]) => f.n.size >= MIN).sort((a, b) => b[1].n.size - a[1].n.size)
console.log(`${texts.length} textes d'entraînement · ${fam.size} formes d'erreur inconnues · ${top.length} reviennent dans au moins ${MIN} textes\n`)
for (const [s, f] of top.slice(0, 40)) console.log(`${String(f.n.size).padStart(3)} × ${s}\n      ex : ${f.ex[0]}`)
