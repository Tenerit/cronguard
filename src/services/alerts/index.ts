import nodemailer, { type Transporter } from 'nodemailer'
import axios      from 'axios'
import { logger }       from '../../config/logger'
import { signWebhook }  from '../webhook-signature'
import { isSafeWebhookTarget } from '../webhook-guard'
import { escapeHtml }   from '../escape'
import { redis }        from '../../config/redis'
import type { AnalysisResult } from '../llm/analyzer'

// Compteur cross-process des échecs de LIVRAISON de notification. Exposé en /metrics
// (cronguard_notification_failures_total) → un canal qui tombe en silence (SMTP mal
// configuré, webhook injoignable) devient visible/alertable, pas seulement loggé.
function bumpNotifyFail(channel: 'email' | 'slack' | 'webhook'): void {
  redis.incr(`metrics:notify_fail:${channel}`).catch(() => { /* best-effort, non bloquant */ })
}

// Lazy : créé seulement au premier envoi, pas au chargement du module
// Évite le crash si SMTP n'est pas configuré (optionnel en dev)
let _mailer: Transporter | null = null

function getMailer() {
  if (!_mailer) {
    _mailer = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT ?? '465'),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return _mailer
}

const SEVERITY_EMOJI: Record<string, string> = {
  low:      '🟡',
  medium:   '🟠',
  high:     '🔴',
  critical: '🚨',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertPayload {
  jobName:       string
  env:           string
  lastPingAt?:   string
  analysis?:     AnalysisResult | null
  alertCount?:   number       // nb d'alertes depuis le début de l'incident
  firstFired?:   Date         // début de l'incident
  statusPageUrl: string
  client: {
    email:         string
    slackWebhook?: string
    webhookUrl?:   string
  }
}

// ─── Slack ───────────────────────────────────────────────────────────────────

export async function sendSlackAlert(payload: AlertPayload) {
  const { slackWebhook } = payload.client
  if (!slackWebhook) return

  const emoji   = SEVERITY_EMOJI[payload.analysis?.severity ?? 'medium']
  const hasAI   = !!payload.analysis
  const isRepeat = (payload.alertCount ?? 1) > 1
  const duration = payload.firstFired
    ? formatDuration(Date.now() - new Date(payload.firstFired).getTime())
    : null

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji}${isRepeat ? ' [REPEAT]' : ''} Job en échec : ${payload.jobName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Environnement*\n${payload.env}` },
        { type: 'mrkdwn', text: `*Dernier ping*\n${payload.lastPingAt ?? 'Jamais'}` },
        ...(isRepeat ? [
          { type: 'mrkdwn', text: `*Alertes envoyées*\n${payload.alertCount}` },
          { type: 'mrkdwn', text: `*Durée incident*\n${duration ?? '?'}` },
        ] : []),
      ],
    },
  ]

  if (hasAI) {
    const cat  = payload.analysis!.category ?? 'unknown'
    const prev = payload.analysis!.prevention
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*🧠 Analyse IA* \`${cat}\``,
          `*Cause :* ${payload.analysis!.cause}`,
          `*Piste à vérifier :* ${payload.analysis!.action}`,
          prev ? `*Prévention :* ${prev}` : '',
        ].filter(Boolean).join('\n'),
      },
    })
  }

  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: 'Voir la page de statut' },
      url:  payload.statusPageUrl,
      style: 'primary',
    }],
  })

  if (!(await isSafeWebhookTarget(slackWebhook))) return
  try {
    await axios.post(slackWebhook, { blocks }, { timeout: 5000 })
    logger.info('[Alert] Slack sent', { job: payload.jobName, repeat: isRepeat })
  } catch (err) {
    logger.error('[Alert] Slack failed', { err })
    bumpNotifyFail('slack')
  }
}

// ─── Email ───────────────────────────────────────────────────────────────────

export async function sendEmailAlert(payload: AlertPayload) {
  const emoji    = SEVERITY_EMOJI[payload.analysis?.severity ?? 'medium']
  const hasAI    = !!payload.analysis

  const CAT_COLORS: Record<string, string> = {
    database: '#4a90d9', network: '#9d7aed', timeout: '#d4a017',
    resources: '#e05252', dependency: '#2dba8c', code: '#64748b', unknown: '#94a3b8',
  }
  const cat      = payload.analysis?.category ?? 'unknown'
  const catColor = CAT_COLORS[cat] ?? '#94a3b8'

  const aiSection = hasAI
    ? `
    <div style="background:#f8f9fa;border-left:4px solid #6c63ff;padding:12px 16px;margin:16px 0;border-radius:4px;">
      <p style="font-weight:600;margin:0 0 8px;">🧠 Analyse IA &nbsp;
        <span style="font-size:11px;background:${catColor}22;color:${catColor};padding:2px 8px;border-radius:10px;font-family:monospace">${cat}</span>
      </p>
      <p style="margin:0 0 4px;"><strong>Cause :</strong> ${escapeHtml(payload.analysis!.cause)}</p>
      <p style="margin:0 0 4px;"><strong>Piste à vérifier :</strong> ${escapeHtml(payload.analysis!.action)}</p>
      ${payload.analysis!.prevention ? `<p style="margin:4px 0 0;color:#4a9aa7;"><strong>Prévention :</strong> ${escapeHtml(payload.analysis!.prevention)}</p>` : ''}
    </div>`
    : `<p style="color:#888;">Analyse IA indisponible — vérifiez les logs manuellement.</p>`

  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#e53e3e;">${emoji} Job en échec : ${escapeHtml(payload.jobName)}</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:8px;color:#666;">Environnement</td>
        <td style="padding:8px;font-weight:500;">${payload.env}</td>
      </tr>
      <tr style="background:#f8f9fa;">
        <td style="padding:8px;color:#666;">Dernier ping reçu</td>
        <td style="padding:8px;font-weight:500;">${payload.lastPingAt ?? 'Jamais'}</td>
      </tr>
    </table>
    ${aiSection}
    <a href="${payload.statusPageUrl}"
       style="display:inline-block;background:#6c63ff;color:white;padding:10px 20px;
              border-radius:6px;text-decoration:none;margin-top:8px;">
      Voir la page de statut →
    </a>
    <p style="color:#aaa;font-size:12px;margin-top:24px;">
      CronGuard · <a href="#">Gérer les alertes</a>
    </p>
  </div>`

  try {
    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      payload.client.email,
      subject: `${emoji} Job en échec : ${payload.jobName} (${payload.env})`,
      html,
    })
    logger.info('[Alert] Email sent', { to: payload.client.email, job: payload.jobName })
  } catch (err) {
    logger.error('[Alert] Email failed', { err })
    bumpNotifyFail('email')
  }
}

// ─── Webhook générique ─────────────────────────────────────────────────────
// POST du payload JSON brut vers une URL custom (Discord, Teams, PagerDuty,
// n8n, Zapier...). À l'utilisateur de router/formater côté réception.

export async function sendWebhookAlert(payload: AlertPayload) {
  const { webhookUrl } = payload.client
  if (!webhookUrl) return
  if (!(await isSafeWebhookTarget(webhookUrl))) return

  const body = {
    event:         'alert',
    job:           payload.jobName,
    env:           payload.env,
    severity:      payload.analysis?.severity ?? 'medium',
    category:      payload.analysis?.category ?? 'unknown',
    cause:         payload.analysis?.cause ?? null,
    action:        payload.analysis?.action ?? null,
    prevention:    payload.analysis?.prevention ?? null,
    data_impact:   payload.analysis?.data_impact ?? null,
    fix_minutes:   payload.analysis?.fix_minutes ?? null,
    alert_count:   payload.alertCount ?? 1,
    last_ping_at:  payload.lastPingAt ?? null,
    status_page:   payload.statusPageUrl,
    timestamp:     new Date().toISOString(),
  }
  try {
    const json = JSON.stringify(body)
    await axios.post(webhookUrl, json, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json', ...signWebhook(json) },
    })
    logger.info('[Alert] Webhook sent', { job: payload.jobName })
  } catch (err) {
    logger.error('[Alert] Webhook failed', { err })
    bumpNotifyFail('webhook')
  }
}

export async function sendAlert(payload: AlertPayload) {
  await Promise.allSettled([
    sendSlackAlert(payload),
    sendEmailAlert(payload),
    sendWebhookAlert(payload),
  ])
}

// ─── Notification de rétablissement ('✅ résolu') ──────────────────────────────
// Envoyée quand un monitor en échec repasse à OK.

export interface RecoveryPayload {
  jobName:       string
  env:           string
  downMs?:       number     // durée de l'incident
  statusPageUrl: string
  client: {
    email:         string
    slackWebhook?: string
    webhookUrl?:   string
  }
}

export async function sendRecovery(p: RecoveryPayload) {
  const downtime = p.downMs ? formatDuration(p.downMs) : null

  const slack = async () => {
    if (!p.client.slackWebhook) return
    if (!(await isSafeWebhookTarget(p.client.slackWebhook))) return
    await axios.post(p.client.slackWebhook, {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `✅ Rétabli : ${p.jobName}`, emoji: true } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Environnement*\n${p.env}` },
          ...(downtime ? [{ type: 'mrkdwn', text: `*Durée de l'incident*\n${downtime}` }] : []),
        ] },
      ],
    }, { timeout: 5000 })
  }

  const email = async () => {
    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      p.client.email,
      subject: `✅ Rétabli : ${p.jobName} (${p.env})`,
      html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#2dba8c;">✅ Job rétabli : ${escapeHtml(p.jobName)}</h2>
        <p style="color:#555;">Le job a de nouveau pingé avec succès${downtime ? ` après ${downtime} d'incident` : ''}.</p>
        <a href="${p.statusPageUrl}" style="display:inline-block;background:#2dba8c;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px;">Voir la page de statut →</a>
      </div>`,
    })
  }

  const webhook = async () => {
    if (!p.client.webhookUrl) return
    if (!(await isSafeWebhookTarget(p.client.webhookUrl))) return
    const json = JSON.stringify({
      event: 'recovery', job: p.jobName, env: p.env,
      downtime_ms: p.downMs ?? null, status_page: p.statusPageUrl,
      timestamp: new Date().toISOString(),
    })
    await axios.post(p.client.webhookUrl, json, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json', ...signWebhook(json) },
    })
  }

  const results = await Promise.allSettled([slack(), email(), webhook()])
  for (const r of results) if (r.status === 'rejected') logger.error('[Alert] Recovery channel failed', { err: r.reason })
  logger.info('[Alert] Recovery sent', { job: p.jobName, downtime })
}

// ─── Escalade ─────────────────────────────────────────────────────────────────
// Envoyée quand une alerte reste firing + non-ackée au-delà du délai configuré.
// Va vers escalation_email / escalation_webhook (canaux séparés des alertes normales).

export interface EscalationPayload {
  jobName:      string
  env:          string
  firstFired:   Date
  alertCount:   number
  statusPageUrl: string
  escalationEmail?:   string
  escalationWebhook?: string
  analysis?: { cause?: string; action?: string; severity?: string; category?: string } | null
}

export async function sendEscalation(p: EscalationPayload) {
  const down    = formatDuration(Date.now() - p.firstFired.getTime())
  const emoji   = SEVERITY_EMOJI[p.analysis?.severity ?? 'high']
  const subject = `🚨 [ESCALADE] Job toujours en échec : ${p.jobName} (${down})`

  const email = async () => {
    if (!p.escalationEmail) return
    const aiBlock = p.analysis?.cause
      ? `<p style="margin:4px 0"><strong>Cause connue :</strong> ${escapeHtml(p.analysis.cause)}</p>
         <p style="margin:4px 0"><strong>Piste à vérifier :</strong> ${escapeHtml(p.analysis.action ?? '—')}</p>`
      : `<p style="color:#888">Aucune analyse IA disponible.</p>`

    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      p.escalationEmail,
      subject,
      html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;border-top:4px solid #e53e3e;padding-top:16px;">
        <h2 style="color:#e53e3e;margin:0 0 4px;">🚨 Escalade : ${escapeHtml(p.jobName)}</h2>
        <p style="color:#555;margin:0 0 16px;">
          Ce job est en échec depuis <strong>${down}</strong> et n'a pas été pris en charge
          (${p.alertCount} alerte${p.alertCount > 1 ? 's' : ''} envoyée${p.alertCount > 1 ? 's' : ''}).
        </p>
        <div style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;">
          ${aiBlock}
        </div>
        <a href="${p.statusPageUrl}" style="display:inline-block;background:#e53e3e;color:white;
           padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:16px;">
          Voir le statut et acquitter →
        </a>
        <p style="color:#aaa;font-size:12px;margin-top:24px;">CronGuard · Escalade automatique</p>
      </div>`,
    })
    logger.info('[Alert] Escalation email sent', { to: p.escalationEmail, job: p.jobName, down })
  }

  const webhook = async () => {
    if (!p.escalationWebhook) return
    if (!(await isSafeWebhookTarget(p.escalationWebhook))) return
    const json = JSON.stringify({
      event:        'escalation',
      job:          p.jobName,
      env:          p.env,
      severity:     p.analysis?.severity ?? 'high',
      category:     p.analysis?.category ?? 'unknown',
      cause:        p.analysis?.cause ?? null,
      action:       p.analysis?.action ?? null,
      alert_count:  p.alertCount,
      down_since:   p.firstFired.toISOString(),
      down_duration: down,
      status_page:  p.statusPageUrl,
      timestamp:    new Date().toISOString(),
    })
    await axios.post(p.escalationWebhook, json, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json', ...signWebhook(json) },
    })
    logger.info('[Alert] Escalation webhook sent', { job: p.jobName, down })
  }

  const results = await Promise.allSettled([email(), webhook()])
  for (const r of results) {
    if (r.status === 'rejected') logger.error('[Alert] Escalation channel failed', { err: r.reason })
  }
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}min` : `${h}h`
}
