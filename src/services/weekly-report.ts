/**
 * Rapport hebdomadaire CronGuard — envoyé chaque lundi à 8h
 *
 * Pour chaque client Pro actif, envoie un récapitulatif :
 * - Nb de jobs monitorés et leur état
 * - Incidents de la semaine avec diagnostics IA
 * - Jobs les plus fiables et les plus problématiques
 * - Tendances de performance
 */
import { db }     from '../db'
import { logger } from '../config/logger'
import nodemailer  from 'nodemailer'
import { escapeHtml } from './escape'

interface ClientReport {
  id:          string
  email:       string
  monitorCount: number
  okCount:      number
  failCount:    number
  lateCount:    number
  incidents:    IncidentSummary[]
  topJobs:      JobStat[]
  weeklyUptime: number
  value:        { failures: number; fromMemory: number; fixesRecorded: number }
}

interface IncidentSummary {
  jobName:   string
  env:       string
  cause:     string
  action:    string
  severity:  string
  failedAt:  string
}

interface JobStat {
  name:       string
  env:        string
  successRate: number
  avgDuration: number
  status:     string
}

// ─── Collecte des données ─────────────────────────────────────────────────────

interface MonitorRow   { id: string; name: string; env: string; last_status: string; last_ping_at?: string }
interface IncidentRow  { job_name: string; env: string; cause: string | null; action: string | null; severity: string; failed_at: string }
interface StatsRow     { name: string; env: string; last_status: string; ok: string; total: string; avg_dur: number }

async function buildReport(clientId: string, email: string): Promise<ClientReport | null> {
  // Monitors actifs
  const { rows: monitors } = await db.query(`
    SELECT id, name, env, last_status, last_ping_at
    FROM monitors WHERE client_id = $1 AND active = true
  `, [clientId])

  if (!monitors.length) return null

  // Incidents de la semaine avec analyses IA
  const { rows: incidents } = await db.query(`
    SELECT m.name AS job_name, m.env,
           a.cause, a.action, a.severity, a.created_at AS failed_at
    FROM analyses a
    JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1
      AND a.created_at > NOW() - INTERVAL '7 days'
      AND a.alert_type != 'slow'
    ORDER BY a.created_at DESC
    LIMIT 10
  `, [clientId])

  // Stats par monitor sur 7 jours
  const { rows: stats } = await db.query(`
    SELECT m.name, m.env, m.last_status,
           COUNT(*) FILTER (WHERE p.status = 'success') AS ok,
           COUNT(*) AS total,
           ROUND(AVG(p.duration_ms) FILTER (WHERE p.status = 'success'))::int AS avg_dur
    FROM monitors m
    LEFT JOIN pings p ON p.monitor_id = m.id
      AND p.pinged_at > NOW() - INTERVAL '7 days'
    WHERE m.client_id = $1 AND m.active = true
    GROUP BY m.id, m.name, m.env, m.last_status
    ORDER BY ok::float / NULLIF(total, 0) ASC
  `, [clientId])

  // Valeur mesurée, pas estimée : pannes resservies par une correction déjà vérifiée
  // (sans appel au modèle) et corrections enregistrées par l'équipe cette semaine.
  const { rows: [v] } = await db.query(`
    SELECT COUNT(*) FILTER (WHERE a.created_at > NOW() - INTERVAL '7 days' AND a.alert_type != 'slow') AS failures,
           COUNT(*) FILTER (WHERE a.created_at > NOW() - INTERVAL '7 days' AND a.model_used = 'memory') AS from_memory,
           COUNT(*) FILTER (WHERE a.fix_verified_at > NOW() - INTERVAL '7 days') AS fixes
    FROM analyses a
    JOIN monitors m ON m.id = a.monitor_id
    WHERE m.client_id = $1
  `, [clientId])
  const value = { failures: Number(v?.failures ?? 0), fromMemory: Number(v?.from_memory ?? 0), fixesRecorded: Number(v?.fixes ?? 0) }

  const okCount   = monitors.filter((m: MonitorRow) => m.last_status === 'ok').length
  const failCount = monitors.filter((m: MonitorRow) => m.last_status === 'failed').length
  const lateCount = monitors.filter((m: MonitorRow) => m.last_status === 'late').length

  // Uptime global semaine
  const totalPings   = stats.reduce((s: number, r: StatsRow) => s + parseInt(r.total), 0)
  const successPings = stats.reduce((s: number, r: StatsRow) => s + parseInt(r.ok), 0)
  const weeklyUptime = totalPings > 0 ? Math.round(successPings / totalPings * 100) : 100

  const parsedIncidents: IncidentSummary[] = incidents.map((i: IncidentRow) => {
    return {
      jobName:  i.job_name,
      env:      i.env,
      cause:    i.cause || '—',
      action:   i.action || '—',
      severity: i.severity,
      failedAt: new Date(i.failed_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
    }
  })

  const topJobs: JobStat[] = stats.slice(0, 5).map((s: StatsRow) => ({
    name:        s.name,
    env:         s.env,
    successRate: parseInt(s.total) > 0 ? Math.round(parseInt(s.ok) / parseInt(s.total) * 100) : 100,
    avgDuration: s.avg_dur || 0,
    status:      s.last_status,
  }))

  return {
    id: clientId, email,
    monitorCount: monitors.length,
    okCount, failCount, lateCount,
    incidents: parsedIncidents,
    topJobs,
    weeklyUptime,
    value,
  }
}

// ─── Génération du HTML ───────────────────────────────────────────────────────

function buildEmailHtml(report: ClientReport, appUrl: string): string {
  const statusColor = report.weeklyUptime >= 95 ? '#2dba8c' : report.weeklyUptime >= 80 ? '#d4a017' : '#e05252'

  const incidentRows = report.incidents.length
    ? report.incidents.map(i => `
      <tr style="border-bottom:1px solid #1a2230">
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#c9d1d9">${escapeHtml(i.jobName)}</td>
        <td style="padding:8px 12px;font-size:11px;color:#8b949e">${escapeHtml(i.env)}</td>
        <td style="padding:8px 12px;font-size:11px;color:#c9d1d9">${escapeHtml(i.cause)}</td>
        <td style="padding:8px 12px;font-size:11px;color:#2dba8c">${escapeHtml(i.action)}</td>
        <td style="padding:8px 12px;font-size:10px;color:#8b949e">${i.failedAt}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="padding:16px;text-align:center;color:#8b949e;font-size:12px">
        ✓ Aucun incident cette semaine
       </td></tr>`

  const jobRows = report.topJobs.map(j => {
    const barColor = j.successRate >= 90 ? '#2dba8c' : j.successRate >= 70 ? '#d4a017' : '#e05252'
    const dur = j.avgDuration > 60000 ? `${Math.round(j.avgDuration/1000)}s` : `${j.avgDuration}ms`
    return `
      <tr style="border-bottom:1px solid #1a2230">
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#c9d1d9">${escapeHtml(j.name)}</td>
        <td style="padding:8px 12px;font-size:11px;color:#8b949e">${escapeHtml(j.env)}</td>
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:60px;height:4px;background:#1a2230;border-radius:2px;overflow:hidden">
              <div style="width:${j.successRate}%;height:100%;background:${barColor}"></div>
            </div>
            <span style="font-family:monospace;font-size:11px;color:${barColor}">${j.successRate}%</span>
          </div>
        </td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#8b949e">${dur}</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#080a0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:0 auto;padding:32px 16px">

  <!-- Header -->
  <div style="margin-bottom:32px">
    <div style="font-family:monospace;font-size:16px;font-weight:600;color:#2dba8c;margin-bottom:8px">
      ⬡ CronGuard — Rapport hebdomadaire
    </div>
    <div style="font-size:12px;color:#8b949e">
      Semaine du ${new Date(Date.now() - 7*24*3600000).toLocaleDateString('fr-FR')}
      au ${new Date().toLocaleDateString('fr-FR')}
    </div>
  </div>

  <!-- Stats -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px">
    <div style="background:#0d1117;border:1px solid #1a2230;border-radius:6px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:600;font-family:monospace;color:${statusColor}">${report.weeklyUptime}%</div>
      <div style="font-size:10px;color:#8b949e;margin-top:4px">uptime</div>
    </div>
    <div style="background:#0d1117;border:1px solid #1a2230;border-radius:6px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:600;font-family:monospace;color:#2dba8c">${report.okCount}</div>
      <div style="font-size:10px;color:#8b949e;margin-top:4px">ok</div>
    </div>
    <div style="background:#0d1117;border:1px solid #1a2230;border-radius:6px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:600;font-family:monospace;color:#e05252">${report.failCount}</div>
      <div style="font-size:10px;color:#8b949e;margin-top:4px">en échec</div>
    </div>
    <div style="background:#0d1117;border:1px solid #1a2230;border-radius:6px;padding:16px;text-align:center">
      <div style="font-size:24px;font-weight:600;font-family:monospace;color:#d4a017">${report.incidents.length}</div>
      <div style="font-size:10px;color:#8b949e;margin-top:4px">incidents IA</div>
    </div>
  </div>

  <!-- Mémoire des corrections -->
  <div style="background:#0d1117;border:1px solid #1a2230;border-radius:8px;margin-bottom:16px;padding:12px 16px;font-size:12px;color:#c9d1d9">
    <div style="font-size:11px;font-family:monospace;color:#8b949e;margin-bottom:6px">✦ MÉMOIRE DES CORRECTIONS — 7 DERNIERS JOURS</div>
    ${report.value.failures
      ? `<strong>${report.value.fromMemory}</strong> panne(s) sur ${report.value.failures} résolue(s) par une correction déjà vérifiée chez vous, sans appel au modèle.`
      : 'Aucune panne cette semaine.'}
    ${report.value.fixesRecorded
      ? `<br><strong>${report.value.fixesRecorded}</strong> correction(s) enregistrée(s) par l'équipe : elles seront proposées si la panne revient.`
      : `<br>Aucune correction enregistrée : après une panne, « Ce qui a réglé la panne » la fait resservir la prochaine fois.`}
  </div>

  <!-- Incidents -->
  <div style="background:#0d1117;border:1px solid #1a2230;border-radius:8px;margin-bottom:16px;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid #1a2230;font-size:11px;font-family:monospace;color:#8b949e">
      ✦ ANALYSES IA — INCIDENTS DE LA SEMAINE
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid #1a2230">
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">JOB</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">ENV</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">CAUSE</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">PISTE À VÉRIFIER</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">QUAND</th>
        </tr>
      </thead>
      <tbody>${incidentRows}</tbody>
    </table>
  </div>

  <!-- Jobs stats -->
  <div style="background:#0d1117;border:1px solid #1a2230;border-radius:8px;margin-bottom:24px;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid #1a2230;font-size:11px;font-family:monospace;color:#8b949e">
      ⬡ FIABILITÉ DES JOBS — 7 DERNIERS JOURS
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid #1a2230">
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">JOB</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">ENV</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">UPTIME</th>
          <th style="padding:8px 12px;font-size:10px;font-family:monospace;color:#484f58;text-align:left">DURÉE MOY.</th>
        </tr>
      </thead>
      <tbody>${jobRows}</tbody>
    </table>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px">
    <a href="${appUrl}/dashboard"
       style="display:inline-block;background:#2dba8c;color:#000;padding:10px 24px;
              border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">
      Ouvrir le dashboard →
    </a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;font-size:11px;color:#484f58;padding-top:16px;border-top:1px solid #1a2230">
    CronGuard · ${report.monitorCount} monitors · 
    <a href="${appUrl}/dashboard" style="color:#484f58">dashboard</a> · 
    <a href="${appUrl}/status" style="color:#484f58">statut</a>
  </div>
</div>
</body>
</html>`
}

// ─── Envoi ────────────────────────────────────────────────────────────────────

async function sendWeeklyReport(report: ClientReport): Promise<void> {
  if (!process.env.SMTP_PASS) return

  const mailer = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? 'smtp.resend.com',
    port:   parseInt(process.env.SMTP_PORT ?? '465'),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const appUrl  = process.env.APP_URL ?? 'http://localhost:3000'
  const subject = report.incidents.length > 0
    ? `CronGuard — ${report.incidents.length} incident${report.incidents.length > 1 ? 's' : ''} cette semaine · ${report.weeklyUptime}% uptime`
    : `CronGuard — Semaine parfaite ✓ · ${report.weeklyUptime}% uptime`

  await mailer.sendMail({
    from:    `"CronGuard" <${process.env.SMTP_FROM ?? 'reports@cronguard.io'}>`,
    to:      report.email,
    subject,
    html:    buildEmailHtml(report, appUrl),
  })
}

// ─── Runner principal ─────────────────────────────────────────────────────────

export async function sendWeeklyReports(): Promise<void> {
  if (!process.env.SMTP_PASS) {
    logger.debug('[WeeklyReport] SMTP not configured, skipping')
    return
  }

  logger.info('[WeeklyReport] Building reports...')
  let sent = 0, skipped = 0

  try {
    // Clients Pro avec au moins 1 monitor actif
    const { rows: clients } = await db.query(`
      SELECT DISTINCT c.id, c.email
      FROM clients c
      JOIN monitors m ON m.client_id = c.id AND m.active = true
      WHERE c.plan = 'pro'
        AND (c.trial_ends_at IS NULL OR c.trial_ends_at > NOW())
    `)

    for (const client of clients) {
      try {
        const report = await buildReport(client.id, client.email)
        if (!report) { skipped++; continue }
        await sendWeeklyReport(report)
        sent++
        logger.info('[WeeklyReport] Sent', { email: client.email, uptime: report.weeklyUptime })
      } catch (err) {
        logger.error('[WeeklyReport] Failed for client', { email: client.email, err })
      }
    }
  } catch (err) {
    logger.error('[WeeklyReport] Fatal error', { err })
  }

  logger.info('[WeeklyReport] Done', { sent, skipped })
}

// ─── Scheduler — chaque lundi à 8h ───────────────────────────────────────────

function msUntilMondayMorning(): number {
  const now  = new Date()
  const next = new Date(now)
  // Avance au prochain lundi
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  next.setDate(now.getDate() + daysUntilMonday)
  next.setHours(8, 0, 0, 0)
  return next.getTime() - now.getTime()
}

export function scheduleWeeklyReports(): void {
  const ms = msUntilMondayMorning()
  const days = Math.round(ms / 86400000 * 10) / 10
  logger.info(`[WeeklyReport] Scheduled — next run in ${days} days (Monday 8am)`)

  setTimeout(async () => {
    await sendWeeklyReports()
    // Puis toutes les 7 jours
    setInterval(sendWeeklyReports, 7 * 24 * 60 * 60 * 1000)
  }, ms)
}
