import nodemailer, { type Transporter } from 'nodemailer'
import axios      from 'axios'
import { logger }       from '../../config/logger'
import { signWebhook }  from '../webhook-signature'
import { isSafeWebhookTarget } from '../webhook-guard'
import { escapeHtml }   from '../escape'
import { redis }        from '../../config/redis'
import type { AnalysisResult } from '../llm/analyzer'
import { sendChannelAlerts, sendChannelRecovery, type Channels } from './channels'
import { T, langOf, localizeFact, alertLabels, type Lang } from './i18n'

// Compteur cross-process des échecs de LIVRAISON de notification. Exposé en /metrics
// (cronguard_notification_failures_total) → un canal qui tombe en silence (SMTP mal
// configuré, webhook injoignable) devient visible/alertable, pas seulement loggé.
function bumpNotifyFail(channel: 'email' | 'slack' | 'webhook' | 'teams'): void {
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

// Une correction confirmée par un humain n'a pas le même statut qu'une suggestion du modèle.
export function actionLabel(a: AnalysisResult, lang: Lang = 'fr'): string {
  return a.verifiedFix ? `${T[lang].verifiedFix} (${a.verifiedFix.slice(0, 10)})` : T[lang].toCheck
}
const factsOf = (a: AnalysisResult, lang: Lang) => (a.changed ?? []).map(c => localizeFact(lang, c)).join(' ; ')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertPayload {
  jobName:       string
  env:           string
  lastPingAt?:   string
  analysis?:     AnalysisResult | null
  alertCount?:   number       // nb d'alertes depuis le début de l'incident
  firstFired?:   Date         // début de l'incident
  statusPageUrl: string
  fixUrl?:       string       // ouvre le dashboard sur « ce qui a réglé la panne »
  reviewUrl?:    string       // lien signé : valider / corriger cette analyse sans se connecter (/r/<jeton>)
  client: {
    email:         string
    slackWebhook?: string
    webhookUrl?:   string
    teamsWebhook?: string
    channels?:     Channels     // Discord, Google Chat, Mattermost, ntfy, PagerDuty (channels.ts)
    lang?:         Lang         // clients.lang ; absent = français
  }
}

// ─── Slack ───────────────────────────────────────────────────────────────────

export async function sendSlackAlert(payload: AlertPayload) {
  const { slackWebhook } = payload.client
  if (!slackWebhook) return

  const lang    = langOf(payload.client.lang), L = alertLabels(lang, payload.analysis)
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
        text: `${emoji}${isRepeat ? ' [REPEAT]' : ''} ${L.failed(payload.jobName)}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*${L.env}*\n${payload.env}` },
        { type: 'mrkdwn', text: `*${L.lastPing}*\n${payload.lastPingAt ?? L.never}` },
        ...(isRepeat ? [
          { type: 'mrkdwn', text: `*${L.alertsSent}*\n${payload.alertCount}` },
          { type: 'mrkdwn', text: `*${L.incidentDuration}*\n${duration ?? '?'}` },
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
          `*🔍 ${L.diagnosis}* \`${cat}\``,
          `*${L.cause} :* ${payload.analysis!.cause}`,
          `*${actionLabel(payload.analysis!, lang)} :* ${payload.analysis!.action}`,
          prev ? `*${L.prevention} :* ${prev}` : '',
          payload.analysis!.changed?.length ? `*${L.changed} :* ${factsOf(payload.analysis!, lang)}` : '',
          payload.analysis!.step ? `*${L.step} :* ${localizeFact(lang, payload.analysis!.step)}` : '',
          payload.analysis!.knownFix
            ? `*${L.knownFix} — ${payload.analysis!.knownFix.title} :*\n` + payload.analysis!.knownFix.steps.map(s => `• ${s}`).join('\n')
            : '',
          payload.analysis!.evidence?.length
            ? `*${L.logLines} :*\n` + '```' + payload.analysis!.evidence.join('\n').replace(/```/g, "'''") + '```'
            : '',
        ].filter(Boolean).join('\n'),
      },
    })
  }

  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: L.seeStatus },
      url:  payload.statusPageUrl,
      style: 'primary',
    },
    ...(payload.reviewUrl ? [
      { type: 'button', text: { type: 'plain_text', text: L.analysisRight }, url: payload.reviewUrl },
      { type: 'button', text: { type: 'plain_text', text: L.fix }, url: `${payload.reviewUrl}?v=fix` },
    ] : payload.fixUrl ? [{
      type: 'button',
      text: { type: 'plain_text', text: L.whatFixed },
      url:  payload.fixUrl,
    }] : [])],
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
  const lang     = langOf(payload.client.lang), L = alertLabels(lang, payload.analysis)
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
      <p style="font-weight:600;margin:0 0 8px;">🔍 ${L.diagnosis} &nbsp;
        <span style="font-size:11px;background:${catColor}22;color:${catColor};padding:2px 8px;border-radius:10px;font-family:monospace">${cat}</span>
      </p>
      <p style="margin:0 0 4px;"><strong>${L.cause} :</strong> ${escapeHtml(payload.analysis!.cause)}</p>
      <p style="margin:0 0 4px;"><strong>${actionLabel(payload.analysis!, lang)} :</strong> ${escapeHtml(payload.analysis!.action)}</p>
      ${payload.analysis!.changed?.length ? `<p style="margin:0 0 4px;"><strong>${L.changed} :</strong> ${escapeHtml(factsOf(payload.analysis!, lang))}</p>` : ''}
      ${payload.analysis!.step ? `<p style="margin:0 0 4px;"><strong>${L.step} :</strong> ${escapeHtml(localizeFact(lang, payload.analysis!.step))}</p>` : ''}
      ${payload.analysis!.knownFix ? `<div style="margin:8px 0 0;"><strong>${L.knownFix} — ${escapeHtml(payload.analysis!.knownFix.title)}</strong><ul style="margin:4px 0 0;padding-left:18px;">${payload.analysis!.knownFix.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
      ${payload.analysis!.evidence?.length ? `<pre style="margin:8px 0 0;font-size:11px;background:#fff;border:1px solid #e2e8f0;padding:6px 8px;white-space:pre-wrap;">${escapeHtml(payload.analysis!.evidence.join('\n'))}</pre>` : ''}
      ${payload.analysis!.prevention ? `<p style="margin:4px 0 0;color:#4a9aa7;"><strong>${L.prevention} :</strong> ${escapeHtml(payload.analysis!.prevention)}</p>` : ''}
    </div>`
    : `<p style="color:#888;">${L.unavailableMail}</p>`

  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#e53e3e;">${emoji} ${escapeHtml(L.failed(payload.jobName))}</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:8px;color:#666;">${L.env}</td>
        <td style="padding:8px;font-weight:500;">${payload.env}</td>
      </tr>
      <tr style="background:#f8f9fa;">
        <td style="padding:8px;color:#666;">${L.lastPingReceived}</td>
        <td style="padding:8px;font-weight:500;">${payload.lastPingAt ?? L.never}</td>
      </tr>
    </table>
    ${aiSection}
    <a href="${payload.statusPageUrl}"
       style="display:inline-block;background:#6c63ff;color:white;padding:10px 20px;
              border-radius:6px;text-decoration:none;margin-top:8px;">
      ${L.seeStatus} →
    </a>
    ${payload.reviewUrl
      ? `<a href="${escapeHtml(payload.reviewUrl)}" style="display:inline-block;color:#238636;padding:10px 20px;margin-top:8px;">${L.analysisRight}</a><a href="${escapeHtml(payload.reviewUrl)}?v=fix" style="display:inline-block;color:#1f6feb;padding:10px 20px;margin-top:8px;">${L.fix}</a>`
      : payload.fixUrl ? `<a href="${escapeHtml(payload.fixUrl)}" style="display:inline-block;color:#6c63ff;padding:10px 20px;margin-top:8px;">${L.whatFixed} →</a>` : ''}
    <p style="color:#aaa;font-size:12px;margin-top:24px;">
      CronGuard · <a href="#">${L.manageAlerts}</a>
    </p>
  </div>`

  try {
    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      payload.client.email,
      subject: `${emoji} ${L.failed(payload.jobName)} (${payload.env})`,
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
    action_verified: !!payload.analysis?.verifiedFix,
    evidence:      payload.analysis?.evidence ?? [],
    known_fix:     payload.analysis?.knownFix ?? null,
    prevention:    payload.analysis?.prevention ?? null,
    data_impact:   payload.analysis?.data_impact ?? null,
    fix_minutes:   payload.analysis?.fix_minutes ?? null,
    alert_count:   payload.alertCount ?? 1,
    last_ping_at:  payload.lastPingAt ?? null,
    status_page:   payload.statusPageUrl,
    fix_url:       payload.fixUrl ?? null,
    review_url:    payload.reviewUrl ?? null,
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

// ─── Microsoft Teams ──────────────────────────────────────────────────────────
// Webhook « Workflows » de Teams (les connecteurs Office 365 historiques sont retirés) : il attend
// une carte adaptative. Lisible en 5 s à 2h40 : cause, action, ligne décisive, deux boutons de retour.
// Les boutons ouvrent la page signée /r/<jeton> : pas de bot Azure, rien à déclarer chez Microsoft.
export function teamsCard(payload: AlertPayload): object {
  const a = payload.analysis, lang = langOf(payload.client.lang), L = alertLabels(lang, a)
  const facts = a ? [
    { title: L.cause,  value: a.cause },
    { title: actionLabel(a, lang), value: a.action },
    { title: L.severity, value: `${a.severity} · ${L.confidence} ${a.confidence}` },
    ...(a.changed?.length ? [{ title: L.changed, value: factsOf(a, lang) }] : []),
    ...(a.step ? [{ title: L.step, value: localizeFact(lang, a.step) }] : []),
  ] : [{ title: L.analysis, value: L.unavailable }]
  const body: object[] = [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, color: 'Attention',
      text: `${SEVERITY_EMOJI[a?.severity ?? 'medium']} ${L.failedShort(payload.jobName, payload.env)}` },
    { type: 'FactSet', facts },
  ]
  const line = a?.evidence?.[0]
  if (line) body.push({ type: 'TextBlock', text: line, wrap: true, fontType: 'Monospace', size: 'Small', isSubtle: true })
  const actions: object[] = payload.reviewUrl ? [
    { type: 'Action.OpenUrl', title: L.analysisRight, url: payload.reviewUrl },
    { type: 'Action.OpenUrl', title: L.fix, url: `${payload.reviewUrl}?v=fix` },
  ] : []
  actions.push({ type: 'Action.OpenUrl', title: L.statusPage, url: payload.statusPageUrl })
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null,
    content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body, actions } }] }
}

export async function sendTeamsAlert(payload: AlertPayload) {
  const url = payload.client.teamsWebhook
  if (!url || !(await isSafeWebhookTarget(url))) return
  try {
    await axios.post(url, teamsCard(payload), { timeout: 5000 })
    logger.info('[Alert] Teams sent', { job: payload.jobName })
  } catch (err) {
    logger.error('[Alert] Teams failed', { err: (err as Error).message })
    bumpNotifyFail('teams')
  }
}

export async function sendAlert(payload: AlertPayload) {
  await Promise.allSettled([
    sendSlackAlert(payload),
    sendEmailAlert(payload),
    sendWebhookAlert(payload),
    sendTeamsAlert(payload),
    sendChannelAlerts(payload, payload.client.channels),
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
    teamsWebhook?: string
    channels?:     Channels     // Discord, Google Chat, Mattermost, ntfy, PagerDuty (channels.ts)
    lang?:         Lang         // clients.lang ; absent = français
  }
}

export async function sendRecovery(p: RecoveryPayload) {
  const downtime = p.downMs ? formatDuration(p.downMs) : null
  const L = T[langOf(p.client.lang)]

  const slack = async () => {
    if (!p.client.slackWebhook) return
    if (!(await isSafeWebhookTarget(p.client.slackWebhook))) return
    await axios.post(p.client.slackWebhook, {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `✅ ${L.restored(p.jobName)}`, emoji: true } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*${L.env}*\n${p.env}` },
          ...(downtime ? [{ type: 'mrkdwn', text: `*${L.incidentLength}*\n${downtime}` }] : []),
        ] },
      ],
    }, { timeout: 5000 })
  }

  const email = async () => {
    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      p.client.email,
      subject: `✅ ${L.restored(p.jobName)} (${p.env})`,
      html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#2dba8c;">✅ ${escapeHtml(L.jobRestored(p.jobName))}</h2>
        <p style="color:#555;">${L.restoredBody(downtime)}</p>
        <a href="${p.statusPageUrl}" style="display:inline-block;background:#2dba8c;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px;">${L.seeStatus} →</a>
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

  const teams = async () => {
    if (!p.client.teamsWebhook || !(await isSafeWebhookTarget(p.client.teamsWebhook))) return
    await axios.post(p.client.teamsWebhook, { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null,
      content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: [
        { type: 'TextBlock', size: 'Large', weight: 'Bolder', color: 'Good', wrap: true, text: `✅ ${L.restored(p.jobName)} (${p.env})` },
        ...(downtime ? [{ type: 'TextBlock', text: `${L.incidentLength} : ${downtime}`, wrap: true }] : []),
      ] } }] }, { timeout: 5000 })
  }

  const results = await Promise.allSettled([slack(), email(), webhook(), teams(), sendChannelRecovery(p, p.client.channels)])
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
  lang?: Lang
}

export async function sendEscalation(p: EscalationPayload) {
  const down    = formatDuration(Date.now() - p.firstFired.getTime())
  const emoji   = SEVERITY_EMOJI[p.analysis?.severity ?? 'high']
  const L       = T[langOf(p.lang)]
  const subject = L.escSubject(p.jobName, down)

  const email = async () => {
    if (!p.escalationEmail) return
    const aiBlock = p.analysis?.cause
      ? `<p style="margin:4px 0"><strong>${L.knownCause} :</strong> ${escapeHtml(p.analysis.cause)}</p>
         <p style="margin:4px 0"><strong>${L.toCheck} :</strong> ${escapeHtml(p.analysis.action ?? '—')}</p>`
      : `<p style="color:#888">${L.noAnalysis}</p>`

    await getMailer().sendMail({
      from:    `"CronGuard" <${process.env.SMTP_FROM}>`,
      to:      p.escalationEmail,
      subject,
      html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;border-top:4px solid #e53e3e;padding-top:16px;">
        <h2 style="color:#e53e3e;margin:0 0 4px;">🚨 ${escapeHtml(L.escTitle(p.jobName))}</h2>
        <p style="color:#555;margin:0 0 16px;">
          ${L.escBody(down, p.alertCount)}
        </p>
        <div style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;">
          ${aiBlock}
        </div>
        <a href="${p.statusPageUrl}" style="display:inline-block;background:#e53e3e;color:white;
           padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:16px;">
          ${L.ackStatus} →
        </a>
        <p style="color:#aaa;font-size:12px;margin-top:24px;">CronGuard · ${L.autoEsc}</p>
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
