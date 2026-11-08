/**
 * CronGuard SDK — Node.js / TypeScript
 *
 * npm install axios  (seule dépendance)
 *
 * Usage :
 *   import { CronGuard } from './cronguard'
 *   const cg = new CronGuard('http://localhost:3000')
 *
 *   // Wrapper automatique
 *   await cg.monitor('ma-ping-key', async () => {
 *     const count = await syncDatabase()
 *     return { records: count }
 *   })
 *
 *   // Manuel
 *   await cg.success('ma-ping-key', { records: 1500, durationMs: 4200 })
 *   await cg.fail('ma-ping-key', { exitCode: 1, output: err.stack })
 */

import axios from 'axios'

interface PingOptions {
  records?:    number
  durationMs?: number
  exitCode?:   number
  output?:     string
}

interface MonitorResult {
  records?: number
  [key: string]: unknown
}

// Environnement réel du job à l'échec (noms, chemins, booléens ; aucune valeur secrète) : permet au
// serveur d'établir les pannes « marche à la main, pas en cron » (locale, HOME, agent SSH…).
function runContext() {
  const e = process.env
  let user = ''
  try { user = require('os').userInfo().username } catch { /* conteneur sans entrée passwd */ }
  return {
    user, home: e.HOME ?? '', path: (e.PATH ?? '').slice(0, 1024), shell: e.SHELL ?? '',
    lang: e.LC_ALL || e.LANG || '', cwd: process.cwd().slice(0, 256),
    display: !!e.DISPLAY, sshAgent: !!e.SSH_AUTH_SOCK,
  }
}

export class CronGuard {
  constructor(private readonly baseUrl: string) {}

  async success(pingKey: string, opts: PingOptions = {}) {
    return this.ping(pingKey, { status: 'success', ...opts })
  }

  async fail(pingKey: string, opts: PingOptions = {}) {
    return this.ping(pingKey, { status: 'fail', ...opts, context: runContext() })
  }

  // ── Wrapper "fire and forget" ─────────────────────────────────────────────
  // Exécute fn(), mesure la durée, capte les erreurs, envoie le ping.
  // Ne lève jamais d'erreur liée au monitoring pour ne pas casser le job.

  async monitor<T extends MonitorResult>(
    pingKey: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    let result: T

    try {
      result = await fn()
      await this.success(pingKey, {
        durationMs: Date.now() - start,
        records:    result?.records,
      }).catch(() => {}) // Ne pas crasher si le ping échoue
      return result
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      await this.fail(pingKey, {
        durationMs: Date.now() - start,
        exitCode:   1,
        // Capture stack + message (tronqué à 3000 chars)
        output: `${error.message}\n${error.stack ?? ''}`.slice(0, 3000),
      }).catch(() => {})
      throw err // Re-throw pour ne pas masquer l'erreur
    }
  }

  private async ping(pingKey: string, body: Record<string, unknown>) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/ping/${pingKey}`,
        body,
        { timeout: 5000, headers: { 'Content-Type': 'application/json' } }
      )
      return res.data
    } catch {
      // Silencieux — le monitoring ne doit jamais bloquer le job
    }
  }
}

// ── Export fonctionnel (sans instanciation) ───────────────────────────────────

const DEFAULT_URL = process.env.CRONGUARD_URL ?? 'http://localhost:3000'
const cg = new CronGuard(DEFAULT_URL)

export const monitor   = cg.monitor.bind(cg)
export const pingOk    = cg.success.bind(cg)
export const pingFail  = cg.fail.bind(cg)
export default cg
