import { Redis } from 'ioredis'

// ─── Instance Redis partagée ───────────────────────────────────────────────────
// Utilisée par BullMQ, le cache LLM, le circuit breaker et le self-monitor.
// Configurée via REDIS_URL.

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      lazyConnect:          false,
    })
    _redis.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ECONNREFUSED')
        console.error('[Redis] Error:', err.message)
    })
  }
  return _redis
}

// Export direct pour compatibilité avec le code existant
export const redis = new Proxy({} as Redis, {
  get(_, prop) { return getRedis()[prop as keyof Redis] }
})
