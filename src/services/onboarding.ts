/**
 * Emails d'onboarding — envoyés par le timeout.checker.ts
 *
 * J+0 inscription  : welcome email (déjà fait dans billing.ts)
 * J+2 sans ping    : rappel de configuration
 * J+7 sans ping    : second rappel avec doc
 */
import { db }      from '../db'
import { logger }  from '../config/logger'
import nodemailer   from 'nodemailer'

const APP_URL  = () => process.env.APP_URL  ?? 'http://localhost:3000'
const FROM     = () => process.env.SMTP_FROM ?? 'hello@cronguard.io'

function getMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT ?? '465'),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

// ─── Vérifie et envoie les rappels d'onboarding ───────────────────────────────

export async function sendOnboardingReminders(): Promise<void> {
  if (!process.env.SMTP_PASS) return

  // Clients inscrits depuis 48h+ sans aucun ping
  const { rows: toRemind } = await db.query(`
    SELECT c.id, c.email, c.created_at, c.onboarding_sent
    FROM clients c
    WHERE c.first_ping_at IS NULL
      AND c.onboarding_sent = false
      AND c.created_at < NOW() - INTERVAL '48 hours'
      AND c.created_at > NOW() - INTERVAL '8 days'
  `)

  if (toRemind.length === 0) return

  logger.info('[Onboarding] Sending reminders', { count: toRemind.length })

  const mailer = getMailer()

  for (const client of toRemind) {
    const daysSince = Math.floor(
      (Date.now() - new Date(client.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    const subject = daysSince <= 3
      ? 'Vous n\'avez pas encore configuré CronGuard'
      : 'Dernière chance — votre compte CronGuard vous attend'

    await mailer.sendMail({
      from:    `"CronGuard" <${FROM()}>`,
      to:      client.email,
      subject,
      html: `
      <div style="font-family:sans-serif;max-width:480px;padding:24px">
        <h2 style="color:#22d3a0;font-size:18px">Prêt en 60 secondes</h2>
        <p style="color:#64748b">
          Vous avez créé votre compte il y a ${daysSince} jours mais n'avez pas encore
          connecté de cron job. Voici comment démarrer :
        </p>

        <div style="background:#0f1218;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:12px;color:#22d3a0">
          # Créer votre premier monitor<br>
          curl -X POST ${APP_URL()}/monitors \\<br>
          &nbsp;&nbsp;-H "X-API-Key: VOTRE_CLE" \\<br>
          &nbsp;&nbsp;-d '{"name":"mon-backup","env":"production"}'<br><br>
          # Ajouter à votre cron<br>
          ./backup.sh && curl ${APP_URL()}/ping/PING_KEY \\<br>
          &nbsp;&nbsp;-d '{"status":"success"}'
        </div>

        <a href="${APP_URL()}/dashboard"
           style="background:#22d3a0;color:#000;padding:10px 20px;border-radius:6px;
                  text-decoration:none;font-weight:600;display:inline-block">
          Ouvrir le dashboard →
        </a>

        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          <a href="${APP_URL()}/unsubscribe?email=${encodeURIComponent(client.email)}" style="color:#94a3b8">
            Se désabonner
          </a>
        </p>
      </div>`,
    }).catch(err => logger.error('[Onboarding] Email failed', { email: client.email, err }))

    // Marque comme envoyé
    await db.query(
      `UPDATE clients SET onboarding_sent = true WHERE id = $1`,
      [client.id]
    )
  }

  logger.info('[Onboarding] Reminders sent', { count: toRemind.length })
}
