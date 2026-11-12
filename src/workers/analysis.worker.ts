import 'dotenv/config'
import { validateEnv }   from '../config/env'
validateEnv()
import axios from 'axios'
import { Worker, Job }   from 'bullmq'
import { db }            from '../db'
import { logger }        from '../config/logger'
import { analyzeFailure, analysisWithoutModel, llmEnabled, llmHeaders, isCloudLLM, hasCertainKnowledge } from '../services/llm/analyzer'
import { recallSimilar, recallVerifiedFix, sameErrorRecently, errorSignature } from '../services/llm/incident-memory'
import { evidenceLines } from '../services/llm/evidence'
import { explainCached } from '../services/llm/explain'
import { teamFixAnalysis } from '../services/team-fixes'
import { contextDiff, resolutionText } from '../services/resolution'
import { stepFact, type RunContext } from '../services/llm/run-context'
import { knownFix }      from '../services/llm/known-fixes'
import { planHasAI }     from '../config/plans'
import { shouldAlert, clearAlert }  from '../services/alerts/dedup'
import { sendAlert, sendRecovery } from '../services/alerts'
import { hashError, sanitizeLogs } from '../services/sanitizer'
import { getPingQueue, getAnalysisQueue, PingJob, AnalysisJob } from '../queue'
import { getRedis }      from '../config/redis'
import { writeHeartbeat } from './self-monitor.worker'
import { signReviewToken } from '../services/review-links'

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

// ─── Hygiène des queues AVANT de créer les workers ────────────────────────────
// NON destructif par défaut : on préserve les jobs en attente (un restart ne doit
// pas perdre le travail en vol). Reset complet seulement via DRAIN_QUEUES_ON_BOOT.

async function drainQueuesFirst(): Promise<void> {
  try {
    const pq = getPingQueue()
    const aq = getAnalysisQueue()
    // Défaut : purge uniquement les jobs déjà TERMINÉS (sans risque). On ne `drain()`
    // PAS les jobs en attente — c'était la cause de pertes d'analyses à chaque restart.
    // Les jobs stale (monitor/client supprimé) sont déjà ignorés par les guards des
    // consumers. Les 'failed' sont conservés (inspection — pas de DLQ dédiée).
    await Promise.all([
      pq.clean(0, 1000, 'completed'),
      aq.clean(0, 1000, 'completed'),
    ])
    // Reset destructif EXPLICITE (reseed / dev) : vide aussi les jobs en attente + failed.
    if (process.env.DRAIN_QUEUES_ON_BOOT === 'true') {
      await Promise.all([
        pq.drain(), aq.drain(),
        pq.clean(0, 1000, 'failed'), aq.clean(0, 1000, 'failed'),
      ])
      logger.warn('[Workers] DRAIN_QUEUES_ON_BOOT=true → jobs en attente vidés')
    }
    logger.debug('[Workers] Hygiène queues OK (jobs en attente préservés)')
  } catch (e) {
    logger.warn('[Workers] Nettoyage queue échoué (non bloquant)', { err: (e as Error).message })
  }
}

// ─── Résolution constatée ─────────────────────────────────────────────────────
// Compare le contexte du dernier échec (qui a une analyse, pas encore de résolution) à celui de la première réussite
// qui le suit, et range la différence sur l'analyse (vide = réparé hors du champ des vérifications, ce qui se dit
// aussi). Appelée à la réussite ET à l'écriture de l'analyse : la première où les deux côtés existent gagne, même
// si le job réussit avant que l'analyse de l'échec soit écrite.
async function attachResolution(monitorId: string): Promise<void> {
  const { rows: [f] } = await db.query(
    `SELECT p.context, p.command, p.pinged_at, a.id AS analysis_id FROM pings p JOIN analyses a ON a.ping_id = p.id
     WHERE p.monitor_id = $1 AND p.status = 'fail' AND p.context IS NOT NULL ORDER BY p.pinged_at DESC LIMIT 1`, [monitorId])
  if (!f) return
  const { rows: [already] } = await db.query(`SELECT resolution FROM analyses WHERE id = $1`, [f.analysis_id])
  if (already?.resolution) return
  const { rows: [ok] } = await db.query(
    `SELECT context, command, pinged_at FROM pings WHERE monitor_id = $1 AND status = 'success' AND context IS NOT NULL
     AND pinged_at > $2 ORDER BY pinged_at ASC LIMIT 1`, [monitorId, f.pinged_at])
  if (!ok) return
  const ctxOf = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as RunContext
  const changes = contextDiff({ command: f.command ?? undefined, context: ctxOf(f.context) }, { command: ok.command ?? undefined, context: ctxOf(ok.context) })
  await db.query(`UPDATE analyses SET resolution = $2 WHERE id = $1`,
    [f.analysis_id, JSON.stringify({ changes, text: changes.length ? resolutionText(changes) : null, at: new Date(ok.pinged_at).toISOString() })])
}

// ─── Worker 1 : Ping processor ────────────────────────────────────────────────

function createPingWorker() {
  return new Worker<PingJob>('ping-processor', async (job: Job<PingJob>) => {
    const { monitorId, clientId, status, durationMs, records, exitCode, output, command, runContext } = job.data

    // Guard : monitor peut avoir été supprimé entre l'enqueue et le traitement
    const { rows: [exists] } = await db.query(
      `SELECT id FROM monitors WHERE id=$1`, [monitorId]
    )
    if (!exists) {
      logger.warn('[Worker] Monitor introuvable, ping ignoré', { monitorId })
      return
    }

    const fail = status === 'fail'
    const { rows: [ping] } = await db.query(
      `INSERT INTO pings (monitor_id,status,duration_ms,records,exit_code,output,context,command)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [monitorId, status, durationMs, records, exitCode, (output ?? '').slice(0, 5000),
       runContext ? JSON.stringify(runContext) : null, runContext && command ? command.slice(0, 1000) : null]
    )

    // Résolution constatée : le SDK n'envoie un contexte en réussite qu'à la première réussite après un échec.
    if (!fail && runContext) await attachResolution(monitorId)

    // La complétion (success/fail) efface l'état "en cours" du run. last_status = 'ok' | 'failed' : c'est ce
    // qu'attendent le tableau de bord, le badge, la page de statut, les métriques et le rapport hebdo (le statut
    // du ping, 'success' | 'fail', y était écrit depuis le premier commit : compteurs à 0, alertes absentes).
    await db.query(
      `UPDATE monitors SET last_ping_at=NOW(), last_status=$2, last_start_at=NULL, hung_alerted=false WHERE id=$1`,
      [monitorId, fail ? 'failed' : 'ok']
    )

    // Enregistre le premier ping client (pour l'onboarding)
    if (status === 'success') {
      await db.query(`
        UPDATE clients SET first_ping_at = NOW()
        WHERE id = $1 AND first_ping_at IS NULL
      `, [clientId])
    }

    if (status === 'success') {
      const cleared = await clearAlert(monitorId)
      // Notif de rétablissement + persistance de l'incident (MTTR/impact)
      if (cleared?.wasFiring) {
        const durationMs = Date.now() - new Date(cleared.firstFired).getTime()

        // Dernière analyse de l'incident → cause racine, sévérité, impact
        const { rows: [la] } = await db.query(`
          SELECT id, severity, category, data_impact, cause
          FROM analyses WHERE monitor_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [monitorId])
        const rootCause: string | null = la?.cause || null

        await db.query(`
          INSERT INTO incidents (monitor_id, started_at, resolved_at, duration_ms,
            alert_count, severity, category, data_impact, root_cause, analysis_id)
          VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9)
        `, [monitorId, cleared.firstFired, durationMs, cleared.alertCount,
            la?.severity ?? null, la?.category ?? null, la?.data_impact ?? null, rootCause, la?.id ?? null])

        const { rows: [rc] } = await db.query(`
          SELECT m.name, m.env, c.email, c.slack_webhook, c.webhook_url, c.teams_webhook, c.channels, c.lang
          FROM monitors m JOIN clients c ON c.id = m.client_id WHERE m.id = $1
        `, [monitorId])
        if (rc) {
          await sendRecovery({
            jobName: rc.name, env: rc.env,
            downMs:  durationMs,
            statusPageUrl: `${APP_URL}/status/${monitorId}`,
            client: { email: rc.email, slackWebhook: rc.slack_webhook, webhookUrl: rc.webhook_url, teamsWebhook: rc.teams_webhook, channels: rc.channels, lang: rc.lang },
          })
        }
      }
      return
    }

    const { rows: [ctx] } = await db.query(`
      SELECT m.name, m.schedule, m.env, m.expected_min, m.expected_max, m.notes,
             c.email, c.slack_webhook,
             (SELECT pinged_at FROM pings WHERE monitor_id=m.id AND status='success' ORDER BY pinged_at DESC LIMIT 1) AS last_success,
             (SELECT AVG(duration_ms) FROM (SELECT duration_ms FROM pings WHERE monitor_id=m.id AND status='success' ORDER BY pinged_at DESC LIMIT 20) recent) AS avg_dur
      FROM monitors m JOIN clients c ON c.id=m.client_id WHERE m.id=$1
    `, [monitorId])

    if (!ctx) return

    // Contexte historique 7 jours
    const { rows: history7d } = await db.query(`
      SELECT status, duration_ms FROM pings
      WHERE monitor_id=$1 AND pinged_at > NOW() - INTERVAL '7 days'
      ORDER BY pinged_at ASC
    `, [monitorId])

    const total       = history7d.length
    const fails7d     = history7d.filter((p: {status: string}) => p.status !== 'success').length
    const successRate = total > 0 ? Math.round((total - fails7d) / total * 100) : 100

    const durations = history7d
      .filter((p: {status: string; duration_ms: number}) => p.duration_ms > 0 && p.status === 'success')
      .map((p: {duration_ms: number}) => p.duration_ms)

    let durationTrend: number | undefined
    if (durations.length >= 6) {
      const mid  = Math.floor(durations.length / 2)
      const avg1 = durations.slice(0, mid).reduce((a: number, b: number) => a + b, 0) / mid
      const avg2 = durations.slice(mid).reduce((a: number, b: number) => a + b, 0) / (durations.length - mid)
      if (avg1 > 0) durationTrend = Math.round((avg2 - avg1) / avg1 * 100)
    }

    const sameErrorBefore = await sameErrorRecently(monitorId, ctx.name, output ?? '')

    // Défaillances simultanées (multi-monitors)
    const { rows: correlatedRows } = await db.query(`
      SELECT m.name FROM pings p
      JOIN monitors m ON m.id = p.monitor_id
      WHERE m.client_id = $1 AND m.id != $2
        AND p.status != 'success'
        AND p.pinged_at > NOW() - INTERVAL '30 minutes'
      GROUP BY m.name LIMIT 5
    `, [clientId, monitorId])
    const correlatedFailures = correlatedRows.map((r: {name: string}) => r.name)

    // Pattern temporel
    const { rows: timePatternRows } = await db.query(`
      SELECT EXTRACT(DOW  FROM pinged_at)::int AS dow,
             EXTRACT(HOUR FROM pinged_at)::int AS hour,
             COUNT(*) AS cnt
      FROM pings WHERE monitor_id=$1 AND status != 'success'
        AND pinged_at > NOW() - INTERVAL '30 days'
      GROUP BY dow, hour HAVING COUNT(*) >= 3
      ORDER BY cnt DESC LIMIT 1
    `, [monitorId])
    let timePattern: string | undefined
    if (timePatternRows.length) {
      const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
      const { dow, hour, cnt } = timePatternRows[0]
      timePattern = `Récurrent : ${cnt} échecs le ${days[dow]} entre ${hour}h–${hour+1}h`
    }

    // ─── Signal 4 : Série temporelle des durées ──────────────────────────────
    // Les 10 derniers runs — la forme (progressive/soudaine) change tout
    const durationSeries = history7d
      .filter((p: {status: string; duration_ms: number}) => p.duration_ms > 0)
      .map((p: {duration_ms: number}) => p.duration_ms)
      .slice(-10)

    // ─── Signal 5 : Causes des incidents précédents ──────────────────────────
    // Pas juste "même erreur avant" (boolean) mais quelles catégories
    const { rows: prevFailureRows } = await db.query(`
      SELECT a.category, COUNT(*) AS cnt
      FROM analyses a
      WHERE a.monitor_id = $1
        AND a.created_at > NOW() - INTERVAL '30 days'
        AND a.created_at < NOW() - INTERVAL '1 minute'
      GROUP BY a.category
      ORDER BY cnt DESC
      LIMIT 5
    `, [monitorId])
    const prevCategories = prevFailureRows.map(
      (r: {category: string; cnt: string}) => `${r.category}(×${r.cnt})`
    )

    // ─── Signal 6 : Série temporelle des records ─────────────────────────────
    // Tendance du volume de données traité
    const recordsSeries = history7d
      .filter((p: {status: string; records: number}) => p.records != null && p.records >= 0)
      .map((p: {records: number}) => p.records)
      .slice(-8)

    // ─── Signal 7 : Delta depuis le dernier succès ────────────────────────────
    let hoursSinceSuccess: number | undefined
    if (ctx.last_success) {
      hoursSinceSuccess = Math.round(
        (Date.now() - new Date(ctx.last_success).getTime()) / 3600000
      )
    }

    // ─── Signal 8 : Taux d'auto-résolution ───────────────────────────────────
    // Ce job s'est-il déjà résolu seul, ou faut-il toujours intervenir ?
    const { rows: [autoResolveRow] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'success'
          AND pinged_at > (
            SELECT MAX(p2.pinged_at) FROM pings p2
            WHERE p2.monitor_id = $1 AND p2.status != 'success'
              AND p2.pinged_at < p.pinged_at
          )
          AND pinged_at - (
            SELECT MAX(p2.pinged_at) FROM pings p2
            WHERE p2.monitor_id = $1 AND p2.status != 'success'
              AND p2.pinged_at < p.pinged_at
          ) < INTERVAL '2 hours'
        ) AS auto_resolved,
        COUNT(*) FILTER (WHERE status != 'success') AS total_fails
      FROM pings p WHERE monitor_id = $1 AND pinged_at > NOW() - INTERVAL '30 days'
    `, [monitorId])

    const autoResolveRate = autoResolveRow?.total_fails > 0
      ? `${autoResolveRow.auto_resolved}/${autoResolveRow.total_fails}`
      : undefined

    // ─── Signal 9 : P95 durée ──────────────────────────────────────────────
    const p95 = (() => {
      if (durations.length < 4) return undefined
      const sorted = [...durations].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length * 0.95)]
    })()

    // ─── Few-shot : analyses passées validées ──────────────────────────────
    const { rows: fewShotRows } = await db.query(`
      SELECT a.cause, COALESCE(a.verified_fix, a.action) AS action, a.category, p.output AS logs FROM analyses a
      JOIN pings p ON p.id = a.ping_id
      WHERE a.monitor_id=$1 AND a.user_feedback='positive' AND p.output IS NOT NULL
      ORDER BY a.created_at DESC LIMIT 2
    `, [monitorId])
    let fewShotExamples: Array<{ logs: string; cause: string; action: string; category: string }> =
      fewShotRows.map((r: {cause: string; action: string; category: string; logs: string}) => (
        { logs: (r.logs ?? '').slice(0, 200), cause: r.cause, action: r.action, category: r.category ?? 'unknown' }
      )).filter(ex => !!ex.cause && !!ex.action)   // écarte les analyses incomplètes

    // Mémoire d'incidents : few-shot par SIMILARITÉ (cross-monitor) plutôt que récence.
    // No-op si MEMORY_ENABLED≠true → on garde le few-shot par récence ci-dessus.
    // Si l'analyse sera servie depuis le cache exact (même empreinte d'erreur),
    // inutile d'embed pour le recall — évite 1 appel embed par panne récurrente
    // (métré si embeddings cloud). Même clé que analyzeFailure : jobName + logs nettoyés.
    const fpHash   = hashError(ctx.name, sanitizeLogs(output ?? '').clean)
    const cacheHit = await getRedis().exists(`analysis:${fpHash}`)
    const recalled = cacheHit ? [] : await recallSimilar(clientId, output ?? '', 2)
    if (recalled.length) fewShotExamples = recalled

    await getAnalysisQueue().add('analyze', {
      monitorId, clientId, pingId: ping.id,
      jobName: ctx.name, env: ctx.env, schedule: ctx.schedule, notes: ctx.notes ?? undefined,
      lastSuccess: ctx.last_success?.toISOString(),
      durationMs, avgDuration: Math.round(ctx.avg_dur ?? 0),
      records, expectedMin: ctx.expected_min, expectedMax: ctx.expected_max,
      exitCode, logs: output ?? '', command, runContext,
      failCount7d:        fails7d,
      successRate7d:      successRate,
      durationTrend,
      sameErrorBefore,
      correlatedFailures: correlatedFailures.length ? correlatedFailures : undefined,
      timePattern,
      fewShotExamples:    fewShotExamples.length
        ? fewShotExamples.map(x => ({ ...x, category: x.category as import('../services/llm/analyzer').ErrorCategory }))
        : undefined,
      // Nouveaux signaux enrichis
      durationSeries:     durationSeries.length >= 3 ? durationSeries : undefined,
      prevCategories:     prevCategories.length ? prevCategories : undefined,
      recordsSeries:      recordsSeries.length >= 3 ? recordsSeries : undefined,
      hoursSinceSuccess,
      autoResolveRate,
      p95Duration:        p95,
    } satisfies AnalysisJob)

  }, { connection: getRedis(), concurrency: 20 })
}

// ─── Worker 2 : LLM analysis ──────────────────────────────────────────────────

function createAnalysisWorker() {
  return new Worker<AnalysisJob>('llm-analysis', async (job: Job<AnalysisJob>) => {
    const ctx = job.data

    // Guard : client et monitor doivent toujours exister
    const { rows: [client] } = await db.query(
      `SELECT email, slack_webhook, webhook_url, teams_webhook, channels, lang, plan FROM clients WHERE id=$1`, [ctx.clientId]
    )
    if (!client) { logger.warn('[Worker] Client supprimé, job ignoré', { clientId: ctx.clientId }); return }

    const { rows: [monitor] } = await db.query(
      `SELECT id FROM monitors WHERE id=$1`, [ctx.monitorId]
    )
    if (!monitor) { logger.warn('[Worker] Monitor supprimé, job ignoré', { monitorId: ctx.monitorId }); return }

    // L'analyse IA est réservée au plan Pro sur l'offre hébergée (planHasAI gère le
    // self-hosted où tout le monde y a droit). Free → on alerte quand même, sans IA.
    const analysis = planHasAI(client.plan)
      // Ordre : correction validée sur CE job → fiche d'équipe (validée par un admin pour cette infra) →
      // correction d'un autre job (si aucune fiche ni constat ne répond) → analyse (faits, fiches, codes).
      ? await recallVerifiedFix(ctx.monitorId, ctx.jobName, ctx.logs, ctx.correlatedFailures)
        ?? await teamFixAnalysis(ctx.clientId, ctx.logs, { failCount7d: ctx.failCount7d, correlatedFailures: ctx.correlatedFailures })
        ?? await recallVerifiedFix(ctx.monitorId, ctx.jobName, ctx.logs, ctx.correlatedFailures,
          { shared: !hasCertainKnowledge(sanitizeLogs(ctx.logs).clean, ctx) }) ?? await analyzeFailure({
          jobName:     ctx.jobName, clientId: ctx.clientId, monitorId: ctx.monitorId,
          env:         ctx.env,
          schedule:    ctx.schedule, lastSuccess: ctx.lastSuccess, notes: ctx.notes,
          duration:    ctx.durationMs, avgDuration: ctx.avgDuration,
          exitCode:    ctx.exitCode, records: ctx.records,
          expectedMin: ctx.expectedMin, expectedMax: ctx.expectedMax,
          logs:        ctx.logs,
          command:     ctx.command, runContext: ctx.runContext,
          failCount7d:        ctx.failCount7d,
          successRate7d:      ctx.successRate7d,
          durationTrend:      ctx.durationTrend,
          sameErrorBefore:    ctx.sameErrorBefore,
          correlatedFailures: ctx.correlatedFailures,
          timePattern:        ctx.timePattern,
          fewShotExamples:    ctx.fewShotExamples as import('../services/llm/analyzer').FewShotExample[] | undefined,
        }) ?? analysisWithoutModel({ logs: ctx.logs, command: ctx.command, runContext: ctx.runContext,
          failCount7d: ctx.failCount7d, exitCode: ctx.exitCode, correlatedFailures: ctx.correlatedFailures })   // LLM en panne ou saturé : on garde ce que les logs disent
      : null

    let analysisId: string | undefined
    if (analysis) {
      const clean = sanitizeLogs(ctx.logs).clean
      analysis.evidence = evidenceLines(clean, analysis.cause)
      const changed = ctx.runContext?.changed ?? []
      if (changed.length) analysis.changed = changed.slice(0, 3).map(c => c.label + (c.before !== undefined ? ` : ${c.before} → ${c.after}` : ''))
      analysis.step = stepFact(ctx.runContext) ?? undefined
      // La correction vérifiée ou la fiche d'équipe (validées chez vous) priment : pas de fiche générique à côté.
      analysis.knownFix = analysis.verifiedFix || analysis.finding?.startsWith('team-') ? null : knownFix(clean)
    }
    if (analysis) {
      const ins = await db.query(
        `INSERT INTO analyses
          (monitor_id,ping_id,error_hash,diagnosis,model_used,alert_type,
           severity,from_cache,tokens_in,tokens_out,
           category,prevention,confidence,correlated_monitors,
           checks,data_impact,fix_minutes,cause,action,verified_fix,fix_verified_at,signature,recognized_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
        [ctx.monitorId, ctx.pingId ?? null, hashError(ctx.jobName, sanitizeLogs(ctx.logs).clean),
         JSON.stringify({ cause: analysis.cause, action: analysis.action,
                          prevention: analysis.prevention, category: analysis.category,
                          checks: analysis.checks, data_impact: analysis.data_impact }),
         analysis.model, 'fail', analysis.severity, analysis.fromCache,
         analysis.tokensIn ?? 0, analysis.tokensOut ?? 0,
         analysis.category ?? 'unknown',
         analysis.prevention ?? null,
         analysis.confidence ?? 'medium',
         analysis.correlatedMonitors?.length ? JSON.stringify(analysis.correlatedMonitors) : null,
         analysis.checks?.length ? JSON.stringify(analysis.checks) : null,
         analysis.data_impact ?? 'none',
         analysis.fix_minutes ?? 30,
         analysis.cause, analysis.action,
         analysis.verifiedFix ? analysis.action : null, analysis.verifiedFix ?? null,
         errorSignature(sanitizeLogs(ctx.logs).clean),
         // Source déterministe qui a répondu ; NULL = panne non reconnue (rapport hebdo, fiches candidates).
         analysis.verifiedFix ? 'memory' : (analysis.finding?.startsWith('hyp-') ? null : analysis.finding) ?? analysis.knownFix?.id ?? null,   // une hypothèse choisie reste « non reconnue »
        ]
      )
      analysisId = ins.rows[0]?.id
      // Le job a peut-être déjà réussi pendant l'analyse : la réparation constatée se range maintenant.
      await attachResolution(ctx.monitorId).catch(err => logger.warn('[Worker] résolution non rangée', { err: (err as Error).message }))
    }

    // shouldAlert avec protection FK
    let alertState: Awaited<ReturnType<typeof shouldAlert>>
    try {
      alertState = await shouldAlert(ctx.monitorId)
    } catch (e: unknown) {
      const msg = (e as Error).message ?? ''
      if (msg.includes('foreign key') || msg.includes('fkey')) {
        logger.warn('[Worker] shouldAlert FK ignorée (monitor obsolète)', { monitorId: ctx.monitorId })
        return
      }
      throw e
    }

    if (alertState.decision === 'send') {
      await sendAlert({
        jobName: ctx.jobName, env: ctx.env, lastPingAt: ctx.lastSuccess,
        analysis, alertCount: alertState.alertCount, firstFired: alertState.firstFired,
        statusPageUrl: `${APP_URL}/status/${ctx.monitorId}`,
        fixUrl: analysisId ? `${APP_URL}/dashboard#fix=${analysisId}` : undefined,
        // Valider / corriger depuis l'alerte, sans se connecter (astreinte) : lien signé pour CETTE analyse.
        reviewUrl: analysisId ? `${APP_URL}/r/${await signReviewToken(analysisId)}` : undefined,
        client: { email: client.email, slackWebhook: client.slack_webhook, webhookUrl: client.webhook_url, teamsWebhook: client.teams_webhook, channels: client.channels, lang: client.lang },
      })
    }

    // Rôle de l'IA : explication en langage simple d'une cause ÉTABLIE, après l'alerte (ne la retarde jamais).
    if (analysis && analysisId) {
      const id = analysisId, a = analysis
      explainCached(a, sanitizeLogs(ctx.logs).clean, a.evidence?.[0])
        .then(text => text ? db.query(`UPDATE analyses SET explanation = $2 WHERE id = $1`, [id, text]) : null)
        .catch(err => logger.warn('[Explain] échec', { err: String(err) }))
    }

    logger.info('[Analysis] Done', {
      job: ctx.jobName,
      severity: analysis?.severity,
      decision: alertState.decision,
      ...(analysis?.category && { category: analysis.category }),
    })

  }, { connection: getRedis(), concurrency: 3, limiter: { max: 30, duration: 60_000 } })
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

async function main() {
  // 1. Migrations DB
  await db.query('SELECT 1') // connexion sanity check
  const { runMigrations } = await import('../db/migrations')
  await runMigrations()

  // 2. Warm-up du modèle LLM — évite le cold start de 30-60s au 1er job (Ollama local).
  //    Inutile pour un provider cloud (pas de cold start, et ça coûterait un appel).
  if (llmEnabled() && !isCloudLLM()) {
    try {
      const llmUrl = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1'
      const model  = process.env.LLM_MODEL ?? 'llama3.2:3b'
      await axios.post(`${llmUrl}/chat/completions`, {
        model, max_tokens: 1, temperature: 0,
        messages: [{ role: 'user', content: 'ok' }],
      }, { timeout: 90_000, headers: llmHeaders() })
      logger.info('[Workers] LLM warm-up OK', { model })
    } catch {
      logger.warn('[Workers] LLM warm-up échoué (Ollama indisponible ou modèle absent)')
    }
  }

  // 4. Vider les queues stale AVANT de créer les workers
  await drainQueuesFirst()

  // 5. Créer les workers APRÈS le drain
  const pingWorker     = createPingWorker()
  const analysisWorker = createAnalysisWorker()

  // Error handlers + DLQ léger
  for (const w of [pingWorker, analysisWorker]) {
    w.on('failed', async (job, err) => {
      logger.error('[Worker] Job failed', { id: job?.id, err: err.message })
      // Dead-letter : on conserve le payload du job échoué (inspection / replay manuel)
      // au lieu de le perdre dans une ligne de log. Liste Redis cappée à 1000, exposée
      // en /metrics via cronguard_analysis_dlq_depth → alertable.
      try {
        if (job) {
          const key = `cronguard:dlq:${job.queueName}`
          await getRedis().lpush(key, JSON.stringify({
            at: Date.now(), id: job.id, name: job.name, reason: err.message, data: job.data,
          }))
          await getRedis().ltrim(key, 0, 999)
        }
      } catch { /* best-effort — ne jamais faire échouer le handler d'erreur */ }
    })
    w.on('error',  (err)      => logger.error('[Worker] Worker error', { err: err.message }))
  }

  logger.info('[Workers] Started — ping(20) + analysis(3)')

  // Heartbeat
  writeHeartbeat()
  setInterval(writeHeartbeat, 5 * 60 * 1000)

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  let shuttingDown = false

  async function shutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`[Workers] ${signal} — arrêt en cours...`)
    try {
      await Promise.all([pingWorker.close(), analysisWorker.close()])
      await getRedis().quit()
      logger.info('[Workers] Arrêt propre.')
    } catch { /* best effort */ }
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

process.on('uncaughtException', (err) => {
  logger.error('[Workers] Uncaught exception', { err: err.message, stack: err.stack })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('[Workers] Unhandled rejection', { reason: String(reason) })
  process.exit(1)
})

main().catch(err => {
  logger.error('[Workers] Fatal', { err: err.message })
  process.exit(1)
})
