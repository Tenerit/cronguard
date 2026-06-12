import { redis }  from '../../config/redis'
import { logger } from '../../config/logger'

// ─── Circuit Breaker (Redis-backed) ──────────────────────────────────────────
// Partagé entre tous les workers via Redis.
// S'ouvre après THRESHOLD erreurs consécutives, se referme après RESET_MS.

const THRESHOLD = 5
const RESET_MS  = 60_000
const KEY_OPEN  = 'llm:circuit_breaker'
const KEY_FAILS = 'llm:circuit_fails'

export async function isOpen(): Promise<boolean> {
  const openAt = await redis.get(KEY_OPEN)
  if (!openAt) return false

  if (Date.now() - parseInt(openAt) > RESET_MS) {
    await Promise.all([redis.del(KEY_OPEN), redis.set(KEY_FAILS, '0')])
    logger.info('[Circuit] Reset — fermé')
    return false
  }
  return true
}

export async function onSuccess(): Promise<void> {
  await redis.set(KEY_FAILS, '0')
}

export async function onFailure(): Promise<void> {
  const fails = await redis.incr(KEY_FAILS)
  await redis.expire(KEY_FAILS, 300)

  if (fails >= THRESHOLD) {
    await redis.set(KEY_OPEN, String(Date.now()))
    logger.error('[Circuit] OUVERT', { fails })
  }
}
