/**
 * Rôle de l'IA n°1 — mesure des attentes fixées AVANT le run (src/services/llm/explain.ts) :
 *   1. fidélité ≥ 95 % (garde-fou : rien d'inventé) · 2. mécanisme gardé ≥ 90 % quand la cause est juste
 *   3. médiane ≤ 60 mots, ≤ 3 phrases · 4. médiane ≤ 8 s.
 * Cas : tous ceux où une source déterministe établit la cause (lab + public à public6).
 *   npx tsx eval/explain.ts          (Ollama requis) → eval/EXPLAIN.md
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { explainRaw, explainable, capSentences, acceptExplanation } from '../src/services/llm/explain'
import { evidenceLines } from '../src/services/llm/evidence'
import { sanitizeLogs } from '../src/services/sanitizer'
import { LABELS } from './rubric'
import { CASES } from './cases'
import { PUBLIC_CASES } from './public-cases'
import { PUBLIC2_CASES } from './public-cases-2'
import { PUBLIC3_CASES } from './public-cases-3'
import { PUBLIC4_CASES } from './public-cases-4'
import { PUBLIC5_CASES } from './public-cases-5'
import { PUBLIC6_CASES } from './public-cases-6'

import { PUBLIC7_CASES } from './public-cases-7'
// EXPLAIN_SET=public7 : seulement le jeu hors échantillon (mesure du 2026-11-11).
const ALL = process.env.EXPLAIN_SET === 'public7' ? PUBLIC7_CASES
  : [...CASES, ...PUBLIC_CASES, ...PUBLIC2_CASES, ...PUBLIC3_CASES, ...PUBLIC4_CASES, ...PUBLIC5_CASES, ...PUBLIC6_CASES]
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const sentences = (s: string) => s.split(/[.!?](\s|$)/).filter(x => x && x.trim().length > 3).length

;(async () => {
  let established = 0
  const rejected: Array<{ name: string; raw: string; invented: string[] }> = []
  const rows: Array<{ name: string; cause: string; text: string; invented: string[]; keep: boolean | null; words: number; sentences: number; ms: number }> = []
  for (const c of ALL) {
    const a = analysisWithoutModel({ logs: c.logs, exitCode: c.exitCode, command: c.command })
    if (!a.finding && !a.knownFix) continue
    established++
    if (process.env.EXPLAIN_TRIAL === '3' && !explainable(a)) continue   // essai 3 : causes certaines seulement
    const clean = sanitizeLogs(c.logs).clean
    const t0 = Date.now()
    const r = await explainRaw(a, clean, evidenceLines(clean, a.cause)[0], 120_000)
    const ms = Date.now() - t0
    if (!r) { rows.push({ name: c.name, cause: a.cause, text: '(aucune réponse)', invented: [], keep: null, words: 0, sentences: 0, ms }); continue }
    if (process.env.EXPLAIN_TRIAL === '3') r.text = capSentences(r.text)
    // Essai 4 : seules les explications acceptées par les garde-fous comptent (les autres = cause brute affichée).
    if (process.env.EXPLAIN_TRIAL === '4') { const ok = acceptExplanation(a.cause, r); if (!ok) { rejected.push({ name: c.name, raw: r.text, invented: r.invented }); continue } r.text = ok }
    const label = LABELS[c.name]?.mech
    const keep = label && label.test(a.cause) ? label.test(r.text) : null   // seulement quand la cause est juste
    rows.push({ name: c.name, cause: a.cause, text: r.text, invented: r.invented, keep, words: words(r.text), sentences: sentences(r.text), ms })
    process.stdout.write('.')
  }
  const answered = rows.filter(r => r.text !== '(aucune réponse)')
  // Essai 4 : fidélité brute = sorties du modèle (acceptées + rejetées) sans identifiant inventé.
  const rawAll = [...answered.map(r => r.invented), ...rejected.map(r => r.invented)]
  const faithful = process.env.EXPLAIN_TRIAL === '4'
    ? rawAll.filter(i => !i.length).length / Math.max(1, rawAll.length)
    : answered.filter(r => !r.invented.length && r.text.length >= 20).length / Math.max(1, rows.length)
  const kept = rows.filter(r => r.keep !== null)
  const keepRate = kept.filter(r => r.keep).length / Math.max(1, kept.length)
  const res = {
    cas: rows.length,
    rejetes_par_garde_fou: rejected.length,
    couverture: `${Math.round(100 * rows.length / Math.max(1, established))} % des ${established} causes établies (essai 3 : attente ≥ 50 %)`,
    fidelite: `${Math.round(100 * faithful)} % (attente ≥ 95 %)`,
    mecanisme_garde: `${Math.round(100 * keepRate)} % sur ${kept.length} (attente ≥ 90 %)`,
    mots_mediane: `${median(answered.map(r => r.words))} (attente ≤ 60)`,
    phrases_max: `${Math.max(0, ...answered.map(r => r.sentences))} (attente ≤ 3)`,
    latence_mediane_s: `${(median(rows.map(r => r.ms)) / 1000).toFixed(1)} (attente ≤ 8)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'EXPLAIN.md'), `# Rôle IA n°1 — expliquer une panne établie (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Exemples (à relire)\n\n' +
    rows.slice(0, 80).map(r => `### ${r.name}${r.invented.length ? ` — ❌ inventé : ${r.invented.join(', ')}` : ''}${r.keep === false ? ' — ⚠ mécanisme perdu' : ''}\n- Cause : ${r.cause}\n- Explication : ${r.text}\n`).join('\n') +
    (rejected.length ? '\n\n## Rejetées par les garde-fous (cause brute affichée à la place)\n\n' +
      rejected.map(r => `### ${r.name}${r.invented.length ? ` — inventé : ${r.invented.join(', ')}` : ' — possibilité perdue ou trop court'}\n- Texte du modèle : ${r.raw}\n`).join('\n') : ''))
})()
