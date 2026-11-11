/**
 * Rôle de l'IA « déjà vu ? » — retrouver la réparation d'une panne passée qui ressemble (embeddings nomic-embed-text,
 * locaux). Mémoire simulée : les 160 pannes du corpus StackExchange, la réponse acceptée jouant la correction écrite
 * par l'équipe. Requêtes : toutes les pannes étiquetées (labo, public à public7). Juste = la correction retrouvée
 * contient la vraie cause ou la bonne action (regex mech/act de la grille).
 *
 * Attentes fixées AVANT le run (2026-11-11), au seuil d'affichage pré-choisi cos ≥ 0,80 :
 *   précision ≥ 60 % ET ≥ 2 × la précision d'une correction tirée au hasard (même requêtes) · couverture ≥ 10 %.
 *   Paires quasi identiques (cos ≥ 0,99) exclues : même question publiée deux fois = fuite, pas un rappel.
 *   Seuils 0,6 / 0,7 / 0,9 rapportés pour information, pas pour choisir après coup.
 *
 *   MEMORY_ENABLED=true LLM_BASE_URL=http://localhost:11434/v1 npx tsx eval/recall.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { embed, cosine } from '../src/services/llm/embeddings'
import { fp } from '../src/services/llm/incident-memory'
import { LABELS } from './rubric'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'
import { PUBLIC6_CASES } from './public-cases-6'
import { PUBLIC7_CASES } from './public-cases-7'

const THRESHOLD = 0.80
const ALL = [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES, ...PUBLIC6_CASES, ...PUBLIC7_CASES]
  .filter(c => LABELS[c.name])

;(async () => {
  const corpus: Array<{ url: string; logs: string; answer: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
  const mem: Array<{ url: string; answer: string; v: number[] }> = []
  for (const c of corpus) { const v = await embed(fp(c.logs)); if (v) mem.push({ url: c.url, answer: c.answer, v }) }
  console.log(`mémoire : ${mem.length}/${corpus.length} pannes embarquées`)
  const rows: Array<{ name: string; s: number; ok: boolean; base: number; url: string; answer: string }> = []
  let leaks = 0
  for (const c of ALL) {
    const v = await embed(fp(c.logs))
    if (!v) continue
    const L = LABELS[c.name]
    const fits = (a: string) => L.mech.test(a) || L.act.test(a)
    const scored = mem.map(m => ({ m, s: cosine(v, m.v) })).filter(x => { if (x.s >= 0.99) { leaks++; return false } return true })
    const best = scored.sort((a, b) => b.s - a.s)[0]
    rows.push({ name: c.name, s: best.s, ok: fits(best.m.answer), base: mem.filter(m => fits(m.answer)).length / mem.length, url: best.m.url, answer: best.m.answer })
    process.stdout.write('.')
  }
  const at = (t: number) => {
    const hit = rows.filter(r => r.s >= t)
    const prec = hit.filter(r => r.ok).length / Math.max(1, hit.length)
    const base = hit.reduce((n, r) => n + r.base, 0) / Math.max(1, hit.length)
    return { seuil: t, couverture: `${Math.round(100 * hit.length / rows.length)} % (${hit.length}/${rows.length})`,
      precision: `${Math.round(100 * prec)} %`, hasard: `${Math.round(100 * base)} %`, faux_montres: `${hit.length - hit.filter(r => r.ok).length}` }
  }
  const table = [0.6, 0.7, THRESHOLD, 0.9].map(at)
  console.log(`\nrequêtes : ${rows.length} · paires quasi identiques exclues : ${leaks}`)
  console.table(table)
  console.log(`Attentes au seuil ${THRESHOLD} : précision ≥ 60 % et ≥ 2 × hasard · couverture ≥ 10 %`)
  writeFileSync(join(__dirname, 'archive', 'RECALL.md'), `# Rôle IA — déjà vu ? (${new Date().toISOString().slice(0, 10)})\n\n` +
    `Requêtes : ${rows.length} · paires quasi identiques exclues : ${leaks}\n\n| seuil | couverture | précision | hasard | faux montrés |\n|---|---|---|---|---|\n` +
    table.map(x => `| ${x.seuil} | ${x.couverture} | ${x.precision} | ${x.hasard} | ${x.faux_montres} |`).join('\n') +
    `\n\n## Rappels au seuil ${THRESHOLD}\n\n` + rows.filter(r => r.s >= THRESHOLD).sort((a, b) => b.s - a.s)
      .map(r => `- ${r.ok ? '✓' : '✗'} **${r.name}** (cos ${r.s.toFixed(3)}) ← ${r.url}\n  ${r.answer.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n') + '\n')
})()
