import { Queue } from 'bullmq'
import { getRedis } from '../config/redis'

// ─── Queues BullMQ ────────────────────────────────────────────────────────────
// Deux queues partagées : traitement des pings et analyse LLM.
// Utilisent l'instance Redis réelle (pas de proxy — BullMQ fait des vérifications internes).

let _pingQueue:     Queue | null = null
let _analysisQueue: Queue | null = null

export function getPingQueue(): Queue {
  if (!_pingQueue) _pingQueue = new Queue('ping-processor', { connection: getRedis() })
  return _pingQueue
}

export function getAnalysisQueue(): Queue {
  if (!_analysisQueue) _analysisQueue = new Queue('llm-analysis', { connection: getRedis() })
  return _analysisQueue
}

// Proxies pour compatibilité avec le code existant (routes, workers)
export const pingQueue     = new Proxy({} as Queue, { get: (_, p) => getPingQueue()[p as keyof Queue] })
export const analysisQueue = new Proxy({} as Queue, { get: (_, p) => getAnalysisQueue()[p as keyof Queue] })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PingJob {
  monitorId:   string
  clientId:    string
  status:      string
  durationMs?: number
  records?:    number
  exitCode?:   number
  output?:     string
}

export interface AnalysisJob {
  monitorId:        string
  clientId:         string
  pingId?:          string
  jobName:          string
  env:              string
  schedule?:        string
  notes?:           string
  lastSuccess?:     string
  durationMs?:      number
  avgDuration?:     number
  exitCode?:        number
  records?:         number
  expectedMin?:     number
  expectedMax?:     number
  logs:             string
  // Contexte historique 7j
  failCount7d?:     number
  successRate7d?:   number
  durationTrend?:   number
  sameErrorBefore?: boolean
  // Multi-signaux (inspiré OpenObserve)
  correlatedFailures?: string[]
  timePattern?:        string
  fewShotExamples?:    Array<{ logs: string; cause: string; action: string; category: string }>
  // Signaux enrichis v2
  durationSeries?:     number[]
  prevCategories?:     string[]
  recordsSeries?:      number[]
  hoursSinceSuccess?:  number
  autoResolveRate?:    string
  p95Duration?:        number
}
