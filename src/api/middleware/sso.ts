import { Request } from 'express'
import { timingSafeEqual } from 'crypto'
import { db }     from '../../db'
import { logger } from '../../config/logger'
import { Role }   from './auth'

// ─── SSO par forward-auth (reverse-proxy de confiance) ────────────────────────
//
// Pour l'ICP self-hosted / air-gapped : l'app NE parle JAMAIS à un IdP (zéro egress,
// cohérent avec l'argument no-data-egress). Un reverse-proxy SSO côté client
// (oauth2-proxy, Authelia, Pomerium, Cloudflare Access, gateway SAML/OIDC corporate)
// authentifie l'humain et injecte son identité en header. L'app fait confiance à ce
// header — mais UNIQUEMENT s'il provient du proxy de confiance (sinon n'importe qui
// forge `X-Forwarded-Email: admin@corp`).
//
// Opt-in (SSO_ENABLED=true). Local par défaut = inchangé (clé API).
//
// Sécurité (fail-closed) :
//  - Confiance accordée si l'IP source ∈ SSO_TRUSTED_PROXIES  OU  un secret partagé
//    correspond (SSO_SHARED_SECRET via SSO_SECRET_HEADER). Au moins un des deux DOIT
//    être configuré, sinon on refuse de lire le header (warn + ignore).
//  - JIT-provisioning seulement si le domaine ∈ SSO_ALLOWED_DOMAINS, rôle par défaut
//    plafonné (viewer/member). `owner` n'est JAMAIS accordé via SSO.

export interface SsoIdentity { email: string; clientId: string; role: Role; plan: string }

export function ssoEnabled(): boolean {
  return process.env.SSO_ENABLED === 'true'
}

function emailHeader(): string {
  return (process.env.SSO_EMAIL_HEADER ?? 'x-forwarded-email').toLowerCase()
}

// Normalise une IP (retire le préfixe IPv4-mapped IPv6 ::ffff:)
function normIp(ip?: string | null): string {
  if (!ip) return ''
  return ip.replace(/^::ffff:/, '').trim()
}

// La requête vient-elle d'un proxy de confiance ? (fail-closed)
function fromTrustedProxy(req: Request): boolean {
  const ipList = (process.env.SSO_TRUSTED_PROXIES ?? '')
    .split(',').map(s => normIp(s)).filter(Boolean)
  const secret = process.env.SSO_SHARED_SECRET

  // Aucun mécanisme configuré → on refuse de faire confiance (sécurité par défaut).
  if (!ipList.length && !secret) {
    logger.warn('[SSO] SSO_ENABLED mais ni SSO_TRUSTED_PROXIES ni SSO_SHARED_SECRET → headers d\'identité ignorés')
    return false
  }

  if (secret) {
    const hdr = (process.env.SSO_SECRET_HEADER ?? 'x-cronguard-sso-secret').toLowerCase()
    const got = req.headers[hdr]
    // Compare en temps constant (anti timing-attack sur le secret partagé).
    // timingSafeEqual exige des buffers de même longueur → garde de longueur d'abord.
    if (typeof got === 'string' && got.length === secret.length &&
        timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return true
  }
  if (ipList.length) {
    const remote = normIp(req.socket?.remoteAddress)
    if (remote && ipList.includes(remote)) return true
  }
  return false
}

// Extrait l'email d'identité prouvé par le proxy, ou null.
export function ssoEmail(req: Request): string | null {
  if (!ssoEnabled()) return null
  if (!fromTrustedProxy(req)) return null
  const raw = req.headers[emailHeader()]
  const email = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return email
}

const ALLOWED_DEFAULT_ROLES: Role[] = ['viewer', 'member', 'admin']

function defaultRole(): Role {
  const r = (process.env.SSO_DEFAULT_ROLE ?? 'viewer').toLowerCase() as Role
  return ALLOWED_DEFAULT_ROLES.includes(r) ? r : 'viewer'  // jamais 'owner' via SSO
}

// Quel client_id rattacher à un nouvel utilisateur SSO ?
async function targetClientId(): Promise<string | null> {
  if (process.env.SSO_CLIENT_ID) return process.env.SSO_CLIENT_ID
  // Self-hosted = un seul client en général : on l'utilise s'il est unique.
  const { rows } = await db.query(`SELECT id FROM clients LIMIT 2`)
  return rows.length === 1 ? rows[0].id : null
}

// Résout l'email SSO → membre (existant) ou JIT-provisioning. Renvoie l'identité ou null.
export async function resolveSsoUser(email: string): Promise<SsoIdentity | null> {
  try {
    // 1. Membre existant (rôle déjà attribué par un owner — on l'honore tel quel)
    const existing = await db.query(`
      SELECT tm.client_id, tm.role, c.plan
      FROM team_members tm JOIN clients c ON c.id = tm.client_id
      WHERE lower(tm.email) = $1
      LIMIT 1
    `, [email])
    if (existing.rows.length) {
      const r = existing.rows[0]
      return { email, clientId: r.client_id, role: r.role as Role, plan: r.plan }
    }

    // 2. JIT-provisioning si le domaine est autorisé
    const domains = (process.env.SSO_ALLOWED_DOMAINS ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const domain = email.split('@')[1]
    if (!domains.length || !domains.includes(domain)) {
      logger.warn('[SSO] Domaine non autorisé (JIT refusé)', { domain })
      return null
    }
    const clientId = await targetClientId()
    if (!clientId) {
      logger.warn('[SSO] Impossible de déterminer le client cible (définir SSO_CLIENT_ID)')
      return null
    }
    const role = defaultRole()
    const ins = await db.query(`
      INSERT INTO team_members (client_id, email, role, invited_by)
      VALUES ($1, $2, $3, 'sso')
      ON CONFLICT (client_id, email) DO UPDATE SET email = EXCLUDED.email
      RETURNING role
    `, [clientId, email, role])
    const { rows: cli } = await db.query(`SELECT plan FROM clients WHERE id = $1`, [clientId])
    logger.info('[SSO] Membre provisionné (JIT)', { email, role: ins.rows[0].role })
    return { email, clientId, role: ins.rows[0].role as Role, plan: cli[0]?.plan ?? 'free' }
  } catch (err) {
    logger.error('[SSO] resolveSsoUser DB error', { err })
    return null
  }
}
