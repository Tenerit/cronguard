import { createHmac } from 'crypto'

// ─── Signature des webhooks sortants (HMAC-SHA256) ────────────────────────────
// Si WEBHOOK_SIGNING_SECRET est défini, chaque webhook générique sortant est signé.
// Le receveur (PagerDuty, n8n, service maison...) peut alors vérifier que l'alerte
// provient bien de CronGuard et se protéger du rejeu via le timestamp.
//
// Format type Stripe : on signe `${timestamp}.${body}` ; le receveur recalcule
// HMAC-SHA256(secret, `${X-CronGuard-Timestamp}.${rawBody}`) et compare (constant-time),
// puis rejette si le timestamp est trop ancien.
//
// Slack a son propre schéma → on NE signe QUE le webhook générique, pas Slack.

export function signWebhook(bodyJson: string): Record<string, string> {
  const secret = process.env.WEBHOOK_SIGNING_SECRET
  if (!secret) return {}
  const ts  = Math.floor(Date.now() / 1000).toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${bodyJson}`).digest('hex')
  return {
    'X-CronGuard-Timestamp': ts,
    'X-CronGuard-Signature': `sha256=${sig}`,
  }
}
