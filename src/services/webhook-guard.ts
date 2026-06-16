import dns from 'dns'
import net from 'net'
import { logger } from '../config/logger'

// ─── Garde anti-SSRF pour les webhooks sortants ───────────────────────────────
// Les URLs de webhook (alerte/recovery/escalade/Slack) sont fournies par le client.
// Sans garde, un client peut faire émettre au host une requête vers le réseau interne
// (endpoint métadonnées cloud, Redis/PG locaux, API interne) → SSRF.
//
// Politique (adaptée à l'ICP air-gapped/on-prem) :
//   - TOUJOURS bloqués : loopback (127/8, ::1, 0.0.0.0), link-local + métadonnées
//     cloud (169.254/16 dont 169.254.169.254, fe80::/10, fd00:ec2::/…). Jamais des
//     cibles webhook légitimes, toujours des cibles SSRF.
//   - Plages privées RFC1918/ULA (10/8, 172.16/12, 192.168/16, fc00::/7) : AUTORISÉES
//     par défaut — l'ICP régulé y héberge ses propres récepteurs (n8n, Slack interne).
//     Bloquées seulement si WEBHOOK_BLOCK_PRIVATE=true (déploiement SaaS multi-tenant).
//   - Schémas autres que http/https : bloqués.
//   - Résolution DNS vérifiée sur les IP réelles → anti DNS-rebinding.

function blockReason(ip: string): string | null {
  const v = net.isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0)                      return 'unspecified'
    if (a === 127)                    return 'loopback'
    if (a === 169 && b === 254)       return 'link-local/metadata'
    if (process.env.WEBHOOK_BLOCK_PRIVATE === 'true') {
      if (a === 10)                   return 'private'
      if (a === 172 && b >= 16 && b <= 31) return 'private'
      if (a === 192 && b === 168)     return 'private'
    }
    return null
  }
  if (v === 6) {
    const low = ip.toLowerCase()
    // IPv4-mapped (::ffff:127.0.0.1) → réévalue en v4
    if (low.startsWith('::ffff:'))    return blockReason(low.slice(7))
    if (low === '::1' || low === '::') return 'loopback'
    if (low.startsWith('fe80'))       return 'link-local'
    if (low.startsWith('fd00:ec2'))   return 'metadata'
    if (process.env.WEBHOOK_BLOCK_PRIVATE === 'true' &&
        (low.startsWith('fc') || low.startsWith('fd'))) return 'private(ULA)'
    return null
  }
  return null
}

// Retourne true si l'URL est sûre à appeler. Logue + retourne false sinon.
export async function isSafeWebhookTarget(rawUrl: string): Promise<boolean> {
  let u: URL
  try { u = new URL(rawUrl) }
  catch { logger.warn('[Webhook] URL invalide bloquée', { rawUrl }); return false }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    logger.warn('[Webhook] Schéma non autorisé bloqué', { proto: u.protocol })
    return false
  }

  let addrs: Array<{ address: string }>
  try { addrs = await dns.promises.lookup(u.hostname, { all: true }) }
  catch { logger.warn('[Webhook] Résolution DNS échouée — bloqué', { host: u.hostname }); return false }

  for (const { address } of addrs) {
    const reason = blockReason(address)
    if (reason) {
      logger.warn('[Webhook] Cible SSRF bloquée', { host: u.hostname, ip: address, reason })
      return false
    }
  }
  return true
}
