// Autres plateformes de notification que mail / Slack / Teams / webhook générique (2026-11-08).
// Une seule colonne JSON clients.channels = { discord?, gchat?, mattermost?, ntfy?, pagerduty? } :
// ajouter une plateforme ne demande pas de migration. Chaque alerte d'échec porte les boutons
// « ✅ Analyse juste » / « ✏️ Corriger » vers la page signée (review.ts) quand la plateforme le permet.
import axios from 'axios'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { isSafeWebhookTarget } from '../webhook-guard'
import type { AlertPayload, RecoveryPayload } from './index'
import { T, langOf, localizeFact, alertLabels } from './i18n'

export type ChannelType = 'discord' | 'gchat' | 'mattermost' | 'ntfy' | 'pagerduty'
export type Channels = Partial<Record<ChannelType, string>>   // URL du webhook, ou clé de routage PagerDuty

const PD_URL = 'https://events.pagerduty.com/v2/enqueue'
const EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }
const COLOR: Record<string, number> = { critical: 0xd73a49, high: 0xe36209, medium: 0xdbab09, low: 0x0366d6 }

interface Msg { title: string; facts: Array<[string, string]>; line?: string; ok?: string; fix?: string; status: string; severity: string; L: typeof T['fr'] }

export function message(p: AlertPayload): Msg {
  const a = p.analysis, lang = langOf(p.client.lang), L = alertLabels(lang, a)
  return {
    title: `${EMOJI[a?.severity ?? 'medium']} ${L.failedShort(p.jobName, p.env)}`,
    facts: a ? [[L.cause, a.cause], [a.verifiedFix ? L.verifiedFix : L.toCheck, a.action],
      ...(a.changed?.length ? [[L.changed, a.changed.map(c => localizeFact(lang, c)).join(' ; ')] as [string, string]] : []),
      ...(a.step ? [[L.step, localizeFact(lang, a.step)] as [string, string]] : [])] : [[L.analysis, L.unavailable]],
    line: a?.evidence?.[0], ok: p.reviewUrl, fix: p.reviewUrl && `${p.reviewUrl}?v=fix`,
    status: p.statusPageUrl, severity: a?.severity ?? 'medium', L,
  }
}

const links = (m: Msg) => [m.ok && `[${m.L.analysisRight}](${m.ok})`, m.fix && `[${m.L.fix}](${m.fix})`, `[${m.L.statusPage}](${m.status})`].filter(Boolean).join(' · ')

// ─── Formats par plateforme (purs : testés sans réseau) ───────────────────────
export const format = {
  discord: (m: Msg) => ({ embeds: [{ title: m.title, color: COLOR[m.severity], url: m.status,
    fields: m.facts.map(([name, value]) => ({ name, value: value.slice(0, 1024) })),
    description: [m.line && '`' + m.line.replace(/`/g, "'") + '`', links(m)].filter(Boolean).join('\n\n') }] }),

  gchat: (m: Msg) => ({ cardsV2: [{ cardId: 'cronguard', card: {
    header: { title: m.title },
    sections: [{ widgets: [
      ...m.facts.map(([topLabel, text]) => ({ decoratedText: { topLabel, text, wrapText: true } })),
      ...(m.line ? [{ textParagraph: { text: `<font color="#888888">${m.line.replace(/</g, '&lt;')}</font>` } }] : []),
      { buttonList: { buttons: [
        ...(m.ok ? [{ text: m.L.analysisRight, onClick: { openLink: { url: m.ok } } }, { text: m.L.fix, onClick: { openLink: { url: m.fix } } }] : []),
        { text: m.L.statusPage, onClick: { openLink: { url: m.status } } },
      ] } },
    ] }],
  } }] }),

  // Mattermost et Rocket.Chat : webhook entrant au format « attachments » de Slack (pas les blocks).
  mattermost: (m: Msg) => ({ username: 'CronGuard', attachments: [{ fallback: m.title, color: '#' + COLOR[m.severity].toString(16).padStart(6, '0'), title: m.title,
    fields: m.facts.map(([title, value]) => ({ title, value, short: false })),
    text: [m.line && '`' + m.line + '`', links(m)].filter(Boolean).join('\n') }] }),

  // ntfy (publication JSON) : push sur le téléphone, boutons d'action natifs ; auto-hébergeable.
  ntfy: (m: Msg, topic: string) => ({ topic, title: m.title, priority: m.severity === 'critical' || m.severity === 'high' ? 5 : 4,
    tags: ['rotating_light'], message: [...m.facts.map(([k, v]) => `${k} : ${v}`), m.line].filter(Boolean).join('\n'),
    click: m.ok ?? m.status,
    actions: [...(m.ok ? [{ action: 'view', label: m.L.analysisRight, url: m.ok }, { action: 'view', label: m.L.fix, url: m.fix }] : []),
              { action: 'view', label: m.L.statusShort, url: m.status }].slice(0, 3) }),

  // PagerDuty Events v2 : déclenche l'incident ; dedup_key = le job → le rétablissement le résout.
  pagerduty: (m: Msg, key: string, job: string) => ({ routing_key: key, event_action: 'trigger', dedup_key: `cronguard:${job}`,
    payload: { summary: m.title.slice(0, 1024), source: 'cronguard', severity: m.severity === 'critical' ? 'critical' : m.severity === 'high' ? 'error' : 'warning',
      custom_details: Object.fromEntries([...m.facts, ...(m.line ? [[m.L.decisiveLine, m.line]] : [])]) },
    links: [...(m.ok ? [{ href: m.ok, text: m.L.analysisRight }, { href: m.fix!, text: m.L.fix }] : []), { href: m.status, text: m.L.statusPage }] }),
}

/** URL de base et topic d'une URL ntfy (https://ntfy.exemple/cronguard → base + « cronguard »). */
export function splitNtfy(url: string): { base: string; topic: string } | null {
  const m = /^(https?:\/\/[^/]+(?:\/.*)?)\/([\w-]{1,64})\/?$/.exec(url)
  return m ? { base: m[1], topic: m[2] } : null
}

async function post(type: ChannelType, url: string, body: object) {
  if (!(await isSafeWebhookTarget(url))) return
  try {
    await axios.post(url, body, { timeout: 5000 })
    logger.info(`[Alert] ${type} sent`)
  } catch (err) {
    logger.error(`[Alert] ${type} failed`, { err: (err as Error).message })
    redis.incr(`metrics:notify_fail:${type}`).catch(() => { /* best-effort */ })
  }
}

export async function sendChannelAlerts(p: AlertPayload, ch: Channels | undefined) {
  if (!ch) return
  const m = message(p), jobs: Promise<void>[] = []
  if (ch.discord)    jobs.push(post('discord', ch.discord, format.discord(m)))
  if (ch.gchat)      jobs.push(post('gchat', ch.gchat, format.gchat(m)))
  if (ch.mattermost) jobs.push(post('mattermost', ch.mattermost, format.mattermost(m)))
  if (ch.ntfy) { const n = splitNtfy(ch.ntfy); if (n) jobs.push(post('ntfy', n.base, format.ntfy(m, n.topic))) }
  if (ch.pagerduty)  jobs.push(post('pagerduty', PD_URL, format.pagerduty(m, ch.pagerduty, p.jobName)))
  await Promise.allSettled(jobs)
}

export async function sendChannelRecovery(p: RecoveryPayload, ch: Channels | undefined) {
  if (!ch) return
  const L = T[langOf(p.client.lang)], title = `✅ ${L.restored(p.jobName)} (${p.env})`, jobs: Promise<void>[] = []
  if (ch.discord)    jobs.push(post('discord', ch.discord, { embeds: [{ title, color: 0x2dba4e, url: p.statusPageUrl }] }))
  if (ch.gchat)      jobs.push(post('gchat', ch.gchat, { text: title }))
  if (ch.mattermost) jobs.push(post('mattermost', ch.mattermost, { username: 'CronGuard', text: title }))
  if (ch.ntfy) { const n = splitNtfy(ch.ntfy); if (n) jobs.push(post('ntfy', n.base, { topic: n.topic, title, message: L.restoredBody(null), tags: ['white_check_mark'] })) }
  if (ch.pagerduty)  jobs.push(post('pagerduty', PD_URL, { routing_key: ch.pagerduty, event_action: 'resolve', dedup_key: `cronguard:${p.jobName}` }))
  await Promise.allSettled(jobs)
}
