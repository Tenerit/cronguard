/**
 * Rôle de l'IA « réécrire le compte rendu de correction de l'équipe » — mesure des attentes fixées AVANT le run
 * (src/services/llm/rewrite.ts) : acceptées ≥ 70 % · brutes sans identifiant inventé ≥ 95 % · plus courtes,
 * médiane ≤ 60 mots · relecture humaine de 20 réécritures (eval/REWRITE.md) : sens déformé ≤ 10 %.
 * Comptes rendus = réponses acceptées du corpus StackExchange (réglage) : les 60 premières de 80 à 700 caractères.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/rewrite.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { rewriteRaw, acceptRewrite } from '../src/services/llm/rewrite'

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0

;(async () => {
  const corpus: Array<{ url: string; answer: string }> = JSON.parse(readFileSync(join(__dirname, 'corpus-raw.json'), 'utf8'))
  const sources = corpus.map(c => ({ url: c.url, fix: c.answer.trim() })).filter(c => c.fix.length >= 80 && c.fix.length <= 700).slice(0, 60)
  const rows: Array<{ url: string; fix: string; raw: string; invented: string[]; lost: string[]; ok: string | null; ms: number }> = []
  for (const s of sources) {
    const t0 = Date.now()
    const r = await rewriteRaw(s.fix, 120_000)
    rows.push({ url: s.url, fix: s.fix, raw: r?.text ?? '', invented: r?.invented ?? [], lost: r?.lost ?? [], ok: r ? acceptRewrite(r) : null, ms: Date.now() - t0 })
    process.stdout.write(r && acceptRewrite(r) ? '.' : 'x')
  }
  const accepted = rows.filter(r => r.ok)
  const res = {
    cas: rows.length,
    acceptees: `${Math.round(100 * accepted.length / rows.length)} % (attente ≥ 70 %)`,
    brutes_sans_invention: `${Math.round(100 * rows.filter(r => r.raw && !r.invented.length).length / rows.length)} % (attente ≥ 95 %)`,
    rejet_identifiant_perdu: rows.filter(r => r.lost.length).length,
    mots_mediane: `${median(accepted.map(r => words(r.ok!)))} contre ${median(accepted.map(r => words(r.fix)))} à l'origine (attente ≤ 60 et plus court)`,
    latence_mediane_s: (median(rows.map(r => r.ms)) / 1000).toFixed(1),
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'REWRITE.md'), `# Rôle IA — réécrire le compte rendu de correction (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Réécritures acceptées (relecture humaine des 20 premières)\n\n' +
    accepted.map((r, i) => `### ${i + 1}. ${r.url}\n- Origine : ${r.fix}\n- Réécrit : ${r.ok}\n`).join('\n') +
    '\n## Rejetées\n\n' + rows.filter(r => !r.ok).map(r => `- ${r.url} — ${r.invented.length ? 'inventé : ' + r.invented.join(', ') : r.lost.length ? 'perdu : ' + r.lost.join(', ') : 'vide ou trop court'}`).join('\n') + '\n')
})()
