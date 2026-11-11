/**
 * Nommage des jobs, essai 2 — le CODE écrit le planning (schedule-text.ts), l'IA ne donne que le nom et le rôle.
 * Jeu NEUF : eval/crontab-lines-2.json, 77 lignes de crontab réelles (questions StackExchange, URLs des jeux précédents
 * exclues, au plus 4 lignes par requête), critique marqué à la main AVANT le run (21 critiques, 5 non critiques).
 * Attentes fixées AVANT le run (mêmes seuils qu'à l'essai 1) :
 *   - nom accepté par les garde-fous ≥ 90 % ;
 *   - relecture humaine de toutes les lignes (eval/archive/JOB-NAMES-2.md) : ce qu'affiche CronGuard (nom + rôle + planning
 *     du code) est juste ≥ 85 % ; plus clair que le nom du code pour ≥ 50 % des lignes (égalité = non) ;
 *   - critique d'accord avec le marquage manuel ≥ 80 % sur les cas clairs · médiane ≤ 5 s par job.
 *   LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M npx tsx eval/job-names-2.ts
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nameJobRaw2 } from '../src/services/llm/job-names'
import { scheduleText } from '../src/services/schedule-text'

// Nommage du code (cronguard-import.sh job_name), colonne utilisateur des crontabs système retirée comme le fait --system.
const USERS = new Set(['root', 'cronuser', 'app_user', 'www-data', 'nobody'])
function codeName(cmd: string): string {
  let words = cmd.split(/\s+/)
  if (USERS.has(words[0])) words = words.slice(1)
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
  const lines: Array<{ schedule: string; command: string; critical: boolean | null }> = JSON.parse(readFileSync(join(__dirname, 'crontab-lines-2.json'), 'utf8'))
  const rows = []
  for (const l of lines) {
    const cmd = l.command.replace(/^(\S+)\s+/, (m, u) => USERS.has(u) ? '' : m)
    const t0 = Date.now()
    const r = await nameJobRaw2(cmd, 120_000)
    rows.push({ ...l, code: codeName(l.command), when: scheduleText(l.schedule), r, ms: Date.now() - t0 })
    process.stdout.write(r?.nom ? '.' : 'x')
  }
  const named = rows.filter(x => x.r?.nom)
  const clear = rows.filter(x => x.r && x.critical !== null)
  const res = {
    lignes: rows.length,
    noms_acceptes: `${Math.round(100 * named.length / rows.length)} % (attente ≥ 90 %)`,
    roles_acceptes: `${Math.round(100 * rows.filter(x => x.r?.role).length / rows.length)} %`,
    critique_accord: `${Math.round(100 * clear.filter(x => x.r!.critique === x.critical).length / Math.max(1, clear.length))} % sur ${clear.length} cas clairs (attente ≥ 80 %)`,
    latence_mediane_s: `${([...rows.map(x => x.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)] / 1000).toFixed(1)} (attente ≤ 5)`,
  }
  console.log('\n', res)
  writeFileSync(join(__dirname, 'archive', 'JOB-NAMES-2.md'), `# Nommage des jobs, essai 2 (${new Date().toISOString().slice(0, 10)})\n\n` +
    Object.entries(res).map(([k, v]) => `- **${k}** : ${v}`).join('\n') + '\n\n## Toutes les lignes (relecture humaine)\n\n' +
    rows.map((x, i) => `${i + 1}. \`${x.schedule} ${x.command.slice(0, 140)}\`\n   - code : **${x.code}**\n   - CronGuard : **${x.r?.nom ?? '(nom rejeté)'}** — ${x.r?.role ?? '(rôle rejeté)'} — ${x.when}${x.r?.critique ? ' — ⚑ critique' : ''}${x.critical !== null ? ` · marqué ${x.critical ? 'critique' : 'non critique'}` : ''}`).join('\n') + '\n')
})()
