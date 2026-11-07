import { db }     from '../db'
import { logger } from '../config/logger'
import nodemailer  from 'nodemailer'
import crypto      from 'crypto'
import { newApiKey, hashApiKey } from './api-keys'

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:3000'
const EXPIRY_MINUTES = 30

// ─── sendResetEmail ───────────────────────────────────────────────────────────

export async function requestKeyReset(email: string): Promise<void> {
  // Vérif silencieuse — on ne révèle pas si l'email existe
  const { rows: [client] } = await db.query(
    `SELECT id FROM clients WHERE email = $1`, [email]
  )
  if (!client) {
    // Délai artificiel pour empêcher l'énumération d'emails
    await new Promise(r => setTimeout(r, 200))
    return
  }

  const token  = crypto.randomBytes(32).toString('hex')
  const expiry = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000)

  await db.query(`
    UPDATE clients
    SET reset_token = $2, reset_token_exp = $3
    WHERE id = $1
  `, [client.id, token, expiry])

  const resetUrl = `${APP_URL()}/auth/reset?token=${token}`

  if (!process.env.SMTP_PASS) {
    logger.info('[Auth] Reset token generated (SMTP not configured)', { email, resetUrl })
    return
  }

  const mailer = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT ?? '465'),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  await mailer.sendMail({
    from:    `"CronGuard" <${process.env.SMTP_FROM ?? 'hello@cronguard.io'}>`,
    to:      email,
    subject: 'Récupération de votre clé API CronGuard',
    html: `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#22d3a0;font-size:18px">Récupérer votre accès</h2>
      <p style="color:#64748b">Ce lien est valable <strong>${EXPIRY_MINUTES} minutes</strong>.</p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#22d3a0;color:#000;padding:10px 20px;
                border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
        Obtenir une nouvelle clé API →
      </a>
      <p style="color:#94a3b8;font-size:12px">
        Si vous n'avez pas demandé cela, ignorez cet email.
      </p>
    </div>`,
  }).catch(err => logger.error('[Auth] Reset email failed', { err }))

  logger.info('[Auth] Reset email sent', { email })
}

// ─── consumeResetToken ───────────────────────────────────────────────────────

export async function consumeResetToken(
  token: string
): Promise<{ apiKey: string; email: string } | null> {
  const { rows: [client] } = await db.query(`
    SELECT id, email
    FROM clients
    WHERE reset_token = $1
      AND reset_token_exp > NOW()
  `, [token])

  if (!client) return null

  // Token à usage unique + nouvelle clé : l'ancienne n'est connue qu'en empreinte,
  // et une récupération laisse supposer qu'elle a pu être perdue ou exposée.
  const apiKey = newApiKey()
  await db.query(`
    UPDATE clients SET reset_token = NULL, reset_token_exp = NULL, api_key = $2
    WHERE id = $1
  `, [client.id, hashApiKey(apiKey)])

  logger.info('[Auth] Reset token consumed', { email: client.email })
  return { apiKey, email: client.email }
}
