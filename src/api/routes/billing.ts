import express      from 'express'
import Stripe        from 'stripe'
import { db }        from '../../db'
import { logger }    from '../../config/logger'
import { sendWelcomeEmail } from '../../services/email'
import { asyncHandler }          from '../middleware/async-handler'
import { requestKeyReset, consumeResetToken } from '../../services/auth'
import { FREE_MONITOR_LIMIT } from '../../config/plans'

const router = express.Router()

// Repasse un client au plan free et désactive ses monitors au-delà de la limite
// free (en gardant les plus anciens). Logique partagée par les événements Stripe
// "paiement échoué (3×)" et "abonnement annulé" — une seule source de vérité.
async function downgradeToFree(customerId: string): Promise<void> {
  await db.query(`UPDATE clients SET plan = 'free' WHERE stripe_id = $1`, [customerId])
  await db.query(`
    UPDATE monitors SET active = false
    WHERE client_id = (SELECT id FROM clients WHERE stripe_id = $1)
      AND id NOT IN (
        SELECT id FROM monitors
        WHERE client_id = (SELECT id FROM clients WHERE stripe_id = $1)
        ORDER BY created_at ASC LIMIT $2
      )
  `, [customerId, FREE_MONITOR_LIMIT])
}

// Lazy : Stripe instancié seulement si la clé est présente
// Évite le crash au démarrage quand STRIPE_SECRET_KEY n'est pas configuré (dev)
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

// ─── POST /webhooks/stripe ────────────────────────────────────────────────────
// Reçoit les événements Stripe et gère l'onboarding automatique.
// Chaque événement est idempotent (safe à rejouer).

router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),  // Raw body requis pour la signature
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string

    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch (err) {
      logger.warn('[Stripe] Invalid webhook signature', { err })
      return res.status(400).send('Invalid signature')
    }

    logger.info('[Stripe] Event received', { type: event.type })

    try {
      switch (event.type) {

        // ── Nouveau client (checkout complété) ────────────────────────────────
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const email   = session.customer_details?.email
          if (!email) break

          const customerId    = session.customer as string
          const subscriptionId = session.subscription as string

          // Crée ou met à jour le client
          await db.query(`
            INSERT INTO clients (email, stripe_id, plan)
            VALUES ($1, $2, 'pro')
            ON CONFLICT (email)
            DO UPDATE SET stripe_id = $2, plan = 'pro'
          `, [email, customerId])

          // Persiste l'abonnement
          await db.query(`
            INSERT INTO subscriptions (client_id, stripe_subscription_id, status)
            SELECT id, $2, 'active' FROM clients WHERE email = $1
            ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active'
          `, [email, subscriptionId])

          const { rows: [newClient] } = await db.query(
            `SELECT api_key FROM clients WHERE email = $1`,
            [email]
          )
          await sendWelcomeEmail(email, newClient?.api_key ?? '—')
          logger.info('[Stripe] New pro client activated', { email })
          break
        }

        // ── Abonnement actif (renewal mensuel) ───────────────────────────────
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice
          const customerId = invoice.customer as string

          await db.query(`
            UPDATE clients SET plan = 'pro'
            WHERE stripe_id = $1
          `, [customerId])
          break
        }

        // ── Paiement échoué (carte expirée, fonds insuffisants) ──────────────
        case 'invoice.payment_failed': {
          const invoice    = event.data.object as Stripe.Invoice
          const customerId = invoice.customer as string
          const attempt    = invoice.attempt_count ?? 1

          if (attempt >= 3) {
            await downgradeToFree(customerId)
            logger.warn('[Stripe] Client downgraded to free after 3 failed payments', { customerId })
          }
          break
        }

        // ── Annulation volontaire ─────────────────────────────────────────────
        case 'customer.subscription.deleted': {
          const sub        = event.data.object as Stripe.Subscription
          const customerId = sub.customer as string

          await downgradeToFree(customerId)
          logger.info('[Stripe] Subscription cancelled', { customerId })
          break
        }

        // ── Upgrade (free → pro) ──────────────────────────────────────────────
        case 'customer.subscription.updated': {
          const sub        = event.data.object as Stripe.Subscription
          const customerId = sub.customer as string
          const isActive   = sub.status === 'active'

          await db.query(`
            UPDATE clients SET plan = $2 WHERE stripe_id = $1
          `, [customerId, isActive ? 'pro' : 'free'])

          if (isActive) {
            // Réactive tous les monitors
            await db.query(`
              UPDATE monitors SET active = true
              WHERE client_id = (SELECT id FROM clients WHERE stripe_id = $1)
            `, [customerId])
          }
          break
        }
      }
    } catch (err) {
      logger.error('[Stripe] Handler error', { type: event.type, err })
      return res.status(500).send('Handler error')
    }

    res.json({ received: true })
  }
)

// ─── POST /auth/register ──────────────────────────────────────────────────────
// Inscription plan free → crée le compte, retourne la clé API

router.post('/register', express.json(), async (req, res) => {
  const { email } = req.body ?? {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  try {
    const { rows: [client] } = await db.query(`
      INSERT INTO clients (email)
      VALUES ($1)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, api_key, plan
    `, [email])

    // Email déjà pris : NE JAMAIS renvoyer la clé API du compte existant ici —
    // n'importe qui devinant l'email la récupérerait (account takeover). On répond
    // sans la clé et on renvoie vers le flux de récupération par email.
    if (!client) {
      return res.status(409).json({
        error:   'Account already exists',
        message: 'Use your existing API key, or POST /auth/reset-request to have it emailed to you.',
      })
    }

    logger.info('[Auth] New client registered', { email })

    return res.status(201).json({
      apiKey: client.api_key,
      plan:   client.plan,
      message: 'Welcome! Use your API key to create monitors.',
    })
  } catch (err) {
    logger.error('[Auth] Registration error', { err })
    return res.status(500).json({ error: 'Registration failed' })
  }
})

// ─── POST /billing/checkout ───────────────────────────────────────────────────
// Génère un lien Stripe Checkout pour passer au plan Pro

router.post('/checkout', express.json(), async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' })

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRO_PRICE_ID) {
    return res.status(503).json({ error: 'Payments not configured' })
  }

  try {
    const { rows: [client] } = await db.query(
      `SELECT id, email, stripe_id FROM clients WHERE api_key = $1`,
      [apiKey]
    )
    if (!client) return res.status(401).json({ error: 'Invalid API key' })

    const session = await getStripe().checkout.sessions.create({
      mode:           'subscription',
      customer_email: client.stripe_id ? undefined : client.email,
      customer:       client.stripe_id ?? undefined,
      success_url:    `${process.env.APP_URL}/dashboard?upgraded=true`,
      cancel_url:     `${process.env.APP_URL}/pricing`,
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      metadata: { clientId: client.id },
    })

    res.json({ checkoutUrl: session.url })
  } catch (err) {
    logger.error('[Billing] Checkout error', { err })
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

export default router


// ─── POST /auth/reset-request — demande de récupération de clé ────────────────

router.post('/reset-request', express.json(), asyncHandler(async (req, res) => {
  const { email } = req.body ?? {}
  if (!email) return res.status(400).json({ error: 'Email required' })

  await requestKeyReset(email)

  // Réponse toujours identique (pas d'énumération d'emails)
  res.json({ message: 'If this email exists, a reset link has been sent.' })
}))

// ─── POST /auth/reset — consomme le token et retourne la clé ─────────────────

router.post('/reset', express.json(), asyncHandler(async (req, res) => {
  const { token } = req.body ?? {}
  if (!token) return res.status(400).json({ error: 'Token required' })

  const result = await consumeResetToken(token)

  if (!result) return res.status(400).json({ error: 'Invalid or expired token' })
  res.json({ apiKey: result.apiKey, email: result.email })
}))

// ─── POST /auth/start-trial — active le trial Pro 14 jours ───────────────────

router.post('/start-trial', express.json(), asyncHandler(async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' })

  const { rows: [client] } = await db.query(
    `SELECT id, plan, trial_ends_at FROM clients WHERE api_key = $1`, [apiKey]
  )
  if (!client) return res.status(401).json({ error: 'Invalid API key' })
  if (client.plan === 'pro') return res.status(400).json({ error: 'Already on Pro plan' })
  if (client.trial_ends_at) return res.status(400).json({ error: 'Trial already used' })

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  await db.query(`
    UPDATE clients SET plan = 'pro', trial_ends_at = $2 WHERE id = $1
  `, [client.id, trialEnd])

  logger.info('[Trial] Started', { clientId: client.id, trialEnd })
  res.json({ plan: 'pro', trialEndsAt: trialEnd, message: '14-day Pro trial started!' })
}))
