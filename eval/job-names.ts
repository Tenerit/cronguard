/**
 * Rôle de l'IA « nommer les jobs à l'import de la crontab » (src/services/llm/job-names.ts) — attentes fixées AVANT le run.
 * Jeu figé : eval/crontab-lines.json, 84 lignes de crontab réelles tirées des questions publiques (StackExchange),
 * critique marqué à la main AVANT le run pour les cas clairs (8 critiques, 14 non critiques, le reste ambigu = non noté).
 *   - acceptés par les garde-fous (nom kebab-case, description sans identifiant inventé) ≥ 90 % ;
 *   - relecture humaine de TOUTES les lignes (eval/archive/JOB-NAMES.md) : nom + description justes ≥ 85 %, et
 *     plus clairs que le nom du code (premier exécutable, cronguard-import.sh) pour ≥ 50 % des lignes (égalité = non) ;
 *   - drapeau critique d'accord avec le marquage manuel ≥ 80 % sur les cas clairs · médiane ≤ 5 s par job.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/job-names.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nameJobRaw } from '../src/services/llm/job-names'

// Même règle que job_name() de sdk/bash/cronguard-import.sh (premier exécutable significatif, sans extension).
function codeName(cmd: string): string {
  const words = cmd.split(/\s+/)
  let skip = false, base = ''
  for (const w of words) {
    if (skip) { skip = false; continue }
    if (w === 'cd') { skip = true; continue }
    if (/=/.test(w) || /^-/.test(w) || ['&&', '||', ';', '|', 'cd', 'sudo', 'nice', 'ionice', 'flock', 'timeout', 'env', 'bash', 'sh', 'node', 'php', '/usr/bin/env'].includes(w)
      || /^(>|<|2>)/.test(w) || /^python/.test(w)) continue
    base = w.split('/').pop() ?? ''; break
  }
  return (base.replace(/\.[^.]*$/, '') || 'job').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 60).replace(/-$/, '')
}

;(async () => {
  const lines: Array<{ schedule: string; command: string; source: string; critical: boolean | null }> =
    JSON.parse(readFileSync(join(__dirname, 'crontab-lines.json'), 'utf8'))
  const rows = []
  for (const l of lines) {
    const t0 = Date.now()
    const r = await nameJobRaw(`${l.schedule} ${l.command}`, 120_000)
    rows.push({ ...l, code: codeName(l.command), ok: r?.ok ?? null, raw: r?.raw ?? null, invented: r?.invented ?? [], ms: Date.now() - t0 })
    process.stdout.write(r?.ok ? '.' : 'x')
  }
  const okRows = rows.filter(r => r.ok)
  const clear = okRows.filter(r => r.critical !== null)
  const res = {
    lignes: rows.length,
    acceptes: `${Math.round(100 * okRows.length / rows.length)} % (attente ≥ 90 %)`,
    critique_accord: `${Math.round(100 * clear.filter(r => r.ok!.critique === r.critical).length / Math.max(1, clear.length))} % sur ${clear.length} cas clairs (attente ≥ 80 %)`,
    latence_mediane_s: `${([...rows.map(r => r.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)] / 1000).toFixed(1)} (attente ≤ 5)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'JOB-NAMES.md'), `# Rôle IA — nommer les jobs à l'import (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Toutes les lignes (relecture humaine)\n\n' +
    rows.map((r, i) => `${i + 1}. \`${r.schedule} ${r.command.slice(0, 140)}\`\n   - code : **${r.code}**\n   - IA : ${r.ok ? `**${r.ok.nom}** — ${r.ok.description}${r.ok.critique ? ' — ⚑ critique' : ''}` : `rejeté (${JSON.stringify(r.raw).slice(0, 120)})`}${r.critical !== null ? ` · marqué ${r.critical ? 'critique' : 'non critique'}` : ''}`).join('\n') + '\n')
})()
