// ─── Plans : source unique de vérité pour les limites, le pricing et le gating ──
// Utilisé par : création de monitor (limite), webhooks Stripe (downgrade),
// la page /pricing, et le gating de l'analyse IA (worker).
//
// Auto-héberge­ment : si Stripe n'est pas configuré (STRIPE_SECRET_KEY absent), il
// n'y a qu'un seul tenant — tout le monde a accès à tout (BILLING_ENABLED=false).

export const BILLING_ENABLED   = !!process.env.STRIPE_SECRET_KEY
export const FREE_MONITOR_LIMIT = parseInt(process.env.FREE_MONITOR_LIMIT ?? '3', 10)

export interface Plan {
  id:           'free' | 'pro'
  name:         string
  priceUsd:     number    // par mois ; 0 pour free
  monitorLimit: number    // Infinity = illimité
  features:     string[]  // affiché sur la page pricing
}

export const PLANS: Record<'free' | 'pro', Plan> = {
  free: {
    id:           'free',
    name:         'Free',
    priceUsd:     0,
    monitorLimit: FREE_MONITOR_LIMIT,
    features: [
      `${FREE_MONITOR_LIMIT} monitors`,
      'Missed / late / slow / hung detection',
      'Email & webhook alerts',
      'Public status pages',
    ],
  },
  pro: {
    id:           'pro',
    name:         'Pro',
    priceUsd:     parseInt(process.env.PRO_PRICE_USD ?? '19', 10),
    monitorLimit: Infinity,
    features: [
      'Unlimited monitors',
      'AI root-cause analysis (local LLM)',
      'Incident memory — recall similar past failures',
      'Escalation & on-call',
      'Audit log',
    ],
  },
}

export function planFor(plan: string): Plan {
  return plan === 'pro' ? PLANS.pro : PLANS.free
}

export function monitorLimitFor(plan: string): number {
  return BILLING_ENABLED ? planFor(plan).monitorLimit : Infinity
}

// L'analyse IA est le différenciateur Pro sur l'offre hébergée. En self-hosted
// (pas de billing), tout le monde y a droit — un seul tenant.
export function planHasAI(plan: string): boolean {
  return !BILLING_ENABLED || plan === 'pro'
}
