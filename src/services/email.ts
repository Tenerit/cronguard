import nodemailer from 'nodemailer'
import { logger } from '../config/logger'

const transport = () => nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.resend.com',
  port:   parseInt(process.env.SMTP_PORT ?? '465'),
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

const APP_URL  = () => process.env.APP_URL  ?? 'http://localhost:3000'
const FROM     = () => process.env.SMTP_FROM ?? 'hello@cronguard.io'

export async function sendWelcomeEmail(email: string, apiKey: string): Promise<void> {
  if (!process.env.SMTP_PASS) return // email non configuré

  const dashboardUrl = `${APP_URL()}/dashboard`
  const apiUrl       = APP_URL()

  await transport().sendMail({
    from:    `"CronGuard" <${FROM()}>`,
    to:      email,
    subject: '✓ Bienvenue sur CronGuard — votre clé API',
    html: `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#22d3a0;font-size:20px;margin-bottom:4px">Bienvenue sur CronGuard</h2>
      <p style="color:#64748b;margin-bottom:24px">Votre compte est actif.</p>

      <div style="background:#0f1218;border-radius:8px;padding:16px;margin-bottom:24px">
        <div style="font-size:11px;color:#64748b;margin-bottom:6px;text-transform:uppercase">Votre clé API</div>
        <code style="font-family:monospace;color:#22d3a0;font-size:14px">${apiKey}</code>
      </div>

      <div style="background:#f8f9fa;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;margin-bottom:24px">
        <div style="color:#64748b;margin-bottom:4px"># Créer un monitor</div>
        <div>curl -X POST ${apiUrl}/monitors -H "X-API-Key: ${apiKey}" \</div>
        <div>&nbsp;&nbsp;-d '{"name":"mon-job","env":"production"}'</div>
      </div>

      <a href="${dashboardUrl}"
         style="background:#22d3a0;color:#000;padding:10px 20px;border-radius:6px;
                text-decoration:none;font-weight:600;display:inline-block">
        Ouvrir le dashboard →
      </a>
    </div>`,
  }).catch(err => logger.error('[Email] Welcome failed', { err }))
}
