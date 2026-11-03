/**
 * Pont promptfoo → analyzeFailure : lit {logs} en JSON sur stdin, imprime le résultat
 * JSON sur stdout. Appelé une fois par cas par provider.cjs (même pré-requis que
 * `npm run eval` : .env présent, Redis + LLM joignables).
 */
import 'dotenv/config'
import { redis } from '../../src/config/redis'
import { analyzeFailure } from '../../src/services/llm/analyzer'

async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const { logs } = JSON.parse(input) as { logs: string }

  // ioredis réessaie indéfiniment : sans ce garde, Redis éteint = eval qui pend au lieu d'échouer.
  await Promise.race([
    redis.ping(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Redis unreachable (REDIS_URL) — start Redis first')), 3000)),
  ])

  // jobName unique → clé de cache unique : chaque run interroge vraiment le modèle.
  const tag = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  await redis.del('llm:circuit_breaker')
  const res = await analyzeFailure(
    { jobName: `redteam-${tag}`, clientId: 'redteam', monitorId: 'redteam', env: 'production', exitCode: 1, logs },
    undefined,
    { skipRateLimit: true },
  )
  process.stdout.write(JSON.stringify(res ?? { error: 'analyzeFailure returned null (LLM down, circuit open or unparsable output)' }))
  await redis.quit()
}

main().catch(async (e) => {
  process.stdout.write(JSON.stringify({ error: String(e?.message ?? e) }))
  redis.disconnect() // pas quit() : il attend une connexion qui peut ne jamais venir
  process.exitCode = 1
})
