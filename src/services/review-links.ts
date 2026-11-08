// Liens signés des alertes : valider ou corriger UNE analyse sans se connecter (astreinte, téléphone).
// Jeton = id d'analyse + expiration + HMAC-SHA256 (secret serveur en base, app_secrets). Il ne donne
// accès qu'à cette analyse, pour 30 jours ; rien d'autre (ni logs complets, ni clé API).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { db } from '../db'

const TTL_DAYS = 30
let secret: Buffer | null = null

async function getSecret(): Promise<Buffer> {
  if (secret) return secret
  // Créé au premier usage (pas de pgcrypto requis) ; ON CONFLICT : deux processus démarrés ensemble gardent le même.
  await db.query(`INSERT INTO app_secrets (name, value) VALUES ('review_links', $1) ON CONFLICT (name) DO NOTHING`, [randomBytes(32).toString('hex')])
  const { rows: [r] } = await db.query(`SELECT value FROM app_secrets WHERE name = 'review_links'`)
  secret = Buffer.from(r.value, 'hex')
  return secret
}

const mac = (key: Buffer, data: string) => createHmac('sha256', key).update(data).digest('base64url')

export async function signReviewToken(analysisId: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + TTL_DAYS * 86400
  return `${analysisId}.${exp}.${mac(await getSecret(), `${analysisId}.${exp}`)}`
}

/** L'id d'analyse si le jeton est intact et non expiré, sinon null. */
export async function verifyReviewToken(token: string, now = Date.now()): Promise<string | null> {
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([\w-]{43})$/.exec(token)
  if (!m) return null
  const [, id, exp, sig] = m
  if (Number(exp) * 1000 < now) return null
  const want = Buffer.from(mac(await getSecret(), `${id}.${exp}`)), got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got) ? id : null
}

/** Réinitialise le secret en mémoire (tests). */
export function _resetSecretCache() { secret = null }
