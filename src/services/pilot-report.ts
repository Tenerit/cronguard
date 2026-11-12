// Rapport de pilote (2026-11-12) : transforme un essai chez un client en chiffres, calculés sur SA machine.
// Rien n'est envoyé : le texte sort sur la sortie standard, le client le relit et décide de le partager.
// Par défaut aucun nom de job ni texte d'erreur (anonymisé) ; --names et --signatures les ajoutent.
//
//   docker compose exec api node dist/services/pilot-report.js --days 30 > pilote.md
//   npx tsx src/services/pilot-report.ts --days 30 --names
import { db } from '../db'

type Queryable = { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }

export interface PilotOptions { days?: number; clientId?: string; names?: boolean; signatures?: boolean }

// Qui a établi la cause (analyses.recognized_by). Même découpage que le rapport hebdo : constaté d'abord.
export function sourceOf(recognizedBy: string | null): string {
  if (!recognizedBy) return 'unknown'
  if (recognizedBy === 'memory') return 'team-validated'
  if (recognizedBy.startsWith('team-')) return 'team-fix'
  if (/^(ctx|cmd)-/.test(recognizedBy)) return 'observed'
  if (/^(curl|rsync|cron|exit)-/.test(recognizedBy)) return 'exit-code'
  return 'library'
}

const LABEL: Record<string, string> = {
  observed:         'Observed on the host by the SDK (fact)',
  'team-validated': 'Fix already validated by your team (same failure)',
  'team-fix':       'Team fix written by your team',
  'exit-code':      'Documented exit code (curl, rsync, cron, signal)',
  library:          'Generic CronGuard fix library (may be off-target on new failures)',
  unknown:          'Not established',
}

const pct = (n: number, d: number) => d ? `${Math.round(100 * n / d)} %` : '—'
function dur(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`
}

export async function pilotReport(q: Queryable, opts: PilotOptions = {}): Promise<string> {
  const days = Math.min(Math.max(Math.floor(opts.days ?? 30), 1), 365)
  // Un seul client par défaut si la base n'en a qu'un (self-hosted) ; sinon --client.
  let clientId = opts.clientId
  if (!clientId) {
    const { rows } = await q.query(`SELECT id FROM clients ORDER BY created_at LIMIT 2`)
    if (rows.length !== 1) throw new Error(rows.length ? 'several accounts in this database: pass --client <id>' : 'no account in this database')
    clientId = rows[0].id
  }
  const P = [clientId, String(days)]
  const since = `NOW() - ($2 || ' days')::interval`

  const { rows: [runs] } = await q.query(`
    SELECT COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE p.status = 'fail')::int AS failures,
           COUNT(DISTINCT p.monitor_id)::int AS jobs
    FROM pings p JOIN monitors m ON m.id = p.monitor_id
    WHERE m.client_id = $1 AND p.pinged_at > ${since}`, P)
  const { rows: an } = await q.query(`
    SELECT a.recognized_by, a.verified_fix IS NOT NULL AS confirmed, a.resolution IS NOT NULL AS observed_fix,
           a.user_feedback, a.signature, m.name
    FROM analyses a JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1 AND a.created_at > ${since}`, P)
  const { rows: inc } = await q.query(`
    SELECT i.duration_ms::float8 AS d FROM incidents i JOIN monitors m ON m.id = i.monitor_id
    WHERE m.client_id = $1 AND i.resolved_at > ${since} ORDER BY i.duration_ms`, P)

  const total = an.length
  const bySource: Record<string, number> = {}
  for (const a of an) bySource[sourceOf(a.recognized_by)] = (bySource[sourceOf(a.recognized_by)] ?? 0) + 1
  const established = total - (bySource.unknown ?? 0)
  const durations = inc.map(r => Number(r.d)).filter(Number.isFinite)
  const median = durations.length ? durations[Math.floor((durations.length - 1) / 2)] : null
  const mean = durations.length ? durations.reduce((s, x) => s + x, 0) / durations.length : null
  const wrong = an.filter(a => a.user_feedback === 'negative').length
  const right = an.filter(a => a.user_feedback === 'positive').length

  const L: string[] = []
  L.push(`# CronGuard pilot report — last ${days} days`, '')
  L.push(`Generated on ${new Date().toISOString().slice(0, 10)} on your own server. Nothing was sent anywhere.`)
  L.push(opts.names || opts.signatures
    ? '**Contains job names or error text: review before sharing.**'
    : 'Anonymised: no job name, no log line, no error text.', '')
  L.push('## Activity', '')
  L.push(`| | |`, `|---|---|`)
  L.push(`| Monitored jobs that ran | ${runs.jobs} |`, `| Runs | ${runs.runs} |`, `| Failed runs | ${runs.failures} |`)
  L.push(`| Diagnosed failures | ${total} |`, '')
  L.push('## Was the cause established?', '')
  L.push(`**${pct(established, total)}** of diagnosed failures (${established}/${total}) had a cause established without guessing.`, '')
  L.push('| Source | Failures | Share |', '|---|---|---|')
  for (const k of ['observed', 'team-validated', 'team-fix', 'exit-code', 'library', 'unknown'])
    if (bySource[k]) L.push(`| ${LABEL[k]} | ${bySource[k]} | ${pct(bySource[k], total)} |`)
  L.push('')
  L.push('## Feedback and fixes', '')
  L.push(`| | |`, `|---|---|`)
  L.push(`| Diagnoses marked right by the team (👍) | ${right} |`)
  L.push(`| Diagnoses marked wrong by the team (👎) | ${wrong} |`)
  L.push(`| Failures without feedback | ${total - right - wrong} |`)
  L.push(`| Fix observed by the SDK at the next success | ${an.filter(a => a.observed_fix).length} (${pct(an.filter(a => a.observed_fix).length, total)}) |`)
  L.push(`| Fix written and confirmed by the team | ${an.filter(a => a.confirmed).length} (${pct(an.filter(a => a.confirmed).length, total)}) |`, '')
  L.push('## Time to restore', '')
  L.push(`| | |`, `|---|---|`)
  L.push(`| Incidents resolved | ${durations.length} |`, `| Median time to restore | ${dur(median)} |`, `| Mean time to restore | ${dur(mean)} |`)
  L.push(`| Total downtime | ${dur(durations.reduce((s, x) => s + x, 0) || null)} |`, '')

  if (opts.names) {
    const per: Record<string, number> = {}
    for (const a of an) per[a.name] = (per[a.name] ?? 0) + 1
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (top.length) L.push('## Jobs with the most failures', '', '| Job | Failures |', '|---|---|', ...top.map(([n, c]) => `| ${n.replace(/\|/g, '\\|')} | ${c} |`), '')
  }
  if (opts.signatures) {
    const per: Record<string, number> = {}
    for (const a of an) if (!a.recognized_by && a.signature) per[a.signature] = (per[a.signature] ?? 0) + 1
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (top.length) L.push('## Failures CronGuard did not recognise (candidates for a team fix)', '', '| Error line (masked) | Count |', '|---|---|',
      ...top.map(([s, c]) => `| \`${s.replace(/[|`]/g, ' ').slice(0, 160)}\` | ${c} |`), '')
  }
  L.push('## How to read it', '')
  L.push('- "Established" counts the source that answered; it does not say the answer was right. The 👍/👎 rows do, for the failures the team reviewed.')
  L.push('- The generic library is measured at about 4/10 on failures it has never seen; facts observed on the host and team fixes are the reliable sources.')
  return L.join('\n') + '\n'
}

if (require.main === module) {
  const a = process.argv.slice(2), val = (f: string) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined }
  pilotReport(db, { days: Number(val('--days') ?? 30), clientId: val('--client'), names: a.includes('--names'), signatures: a.includes('--signatures') })
    .then(r => { process.stdout.write(r); process.exit(0) })
    .catch(e => { process.stderr.write(`pilot-report: ${e.message}\n`); process.exit(1) })
}
