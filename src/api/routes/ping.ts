import { Router }    from 'express'
import rateLimit     from 'express-rate-limit'
import { z }         from 'zod'
import { db }        from '../../db'
import { pingQueue } from '../../queue'
import { logger }    from '../../config/logger'
import { sanitizeLogs } from '../../services/sanitizer'
import { asyncHandler } from '../middleware/async-handler'
import { RUNNERS } from '../../services/llm/run-context'
import { lintScript } from '../../services/llm/script-lint'

export const pingRouter = Router()

const limiter = rateLimit({
  windowMs: 60_000, max: 120,
  keyGenerator: (req) => req.params.pingKey ?? req.ip ?? 'unknown',
  message: { error: 'Too many pings' },
})

// Exporté pour les tests : ils valident avec CE schéma, pas avec une copie (une copie n'avait pas vu le refus de 0).
export const Schema = z.object({
  status:      z.enum(['success', 'fail']),
  // 0 accepté (un job qui échoue en moins d'1 ms, ou busybox qui ne compte qu'en secondes) mais enregistré comme
  // non mesuré : refusé, le ping entier était perdu ; gardé à 0, il fausserait la référence des alertes de lenteur.
  duration_ms: z.number().int().nonnegative().max(86_400_000).optional().transform(v => v || undefined),
  records:     z.number().int().nonnegative().max(1_000_000_000).optional(),
  exit_code:   z.number().int().min(-999).max(999).optional(),
  output:      z.string().max(4000).optional(),
  // Envoyés par le SDK à l'échec : la commande du cron et son environnement réel (noms, chemins,
  // booléens ; jamais de valeurs secrètes). Bornés : un ping ne doit pas pouvoir gonfler la file.
  command:     z.string().max(1000).optional(),
  context:     z.object({
    user:     z.string().max(64).optional(),
    home:     z.string().max(256).optional(),
    path:     z.string().max(1024).optional(),
    shell:    z.string().max(128).optional(),
    lang:     z.string().max(64).optional(),
    cwd:      z.string().max(256).optional(),
    display:  z.boolean().optional(),
    sshAgent: z.boolean().optional(),
    runner:   z.enum(RUNNERS).optional(),
    // Commandes de test du SDK (sdk/*/cg-probes) : shell de connexion et chemins cités par l'erreur.
    loginPath:     z.string().max(1024).optional(),
    loginOnlyVars: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(64)).max(40).optional(),
    loginFound:    z.record(z.string().max(64), z.string().max(256))
                     .refine(o => Object.keys(o).length <= 10, 'loginFound: 10 entrées max').optional(),
    paths:         z.array(z.object({
      path: z.string().max(256), relative: z.boolean(), exists: z.boolean(),
      owner: z.string().max(64).optional(), mode: z.string().max(4).optional(),
      readable: z.boolean().optional(), writable: z.boolean().optional(),
    })).max(5).optional(),
    found:    z.record(z.string().max(64), z.string().max(256))
                .refine(o => Object.keys(o).length <= 10, 'found: 10 entrées max').optional(),
    // Ce qui a changé depuis la dernière réussite (empreinte du SDK : noms, chemins, tailles, dates, versions).
    changed:  z.array(z.object({
      kind: z.enum(['command', 'env', 'var', 'file', 'tool']), label: z.string().max(300),
      before: z.string().max(256).optional(), after: z.string().max(256).optional(),
    })).max(20).optional(),
    // Mémoire et disque relevés par le SDK à l'échec (cgroup v2, statvfs) : des nombres, pas des valeurs sensibles.
    resources: z.object({
      oomKills: z.number().int().nonnegative().max(1_000_000).optional(),
      memMax: z.string().max(32).optional(), memPeak: z.string().max(32).optional(),
      disk: z.array(z.object({ path: z.string().max(200), free: z.number().nonnegative(), total: z.number().nonnegative() })).max(4).optional(),
    }).optional(),
    // Réseau : DNS puis TCP vers les seuls hôtes cités par l'erreur.
    net: z.array(z.object({
      host: z.string().max(253), port: z.number().int().min(0).max(65535),   // 0 : DNS seul (port inconnu)
      dns: z.enum(['ok', 'fail']), tcp: z.enum(['open', 'refused', 'timeout', 'unreachable']).optional(),
    })).max(3).optional(),
    // Étapes marquées par cg_step (nom + horodatage ms) et fin de l'exécution ; chevauchement constaté au démarrage.
    steps:    z.array(z.object({ name: z.string().max(60), at: z.number().int().nonnegative() })).max(20).optional(),
    stepsEnd: z.number().int().nonnegative().optional(),
    overlap:  z.object({ pid: z.number().int().nonnegative(), since: z.number().int().nonnegative() }).optional(),
    // Sorties attendues (CG_EXPECT) vérifiées par le SDK après un code 0.
    expect:   z.array(z.object({
      pattern: z.string().max(200), ok: z.boolean(), reason: z.string().max(80).optional(),
      path: z.string().max(200).optional(), size: z.number().int().nonnegative().optional(), mtime: z.number().int().optional(),
    })).max(5).optional(),
    // Script appelé par la commande (SDK bash, 2026-11-13), secrets déjà masqués. Lu ici puis JETÉ : seuls les ids
    // des risques trouvés (script-lint) entrent dans la file et la base, jamais le texte.
    script:   z.object({ path: z.string().max(256), text: z.string().max(20_000) }).optional(),
  }).optional(),
})

interface PingData {
  status:      'success' | 'fail'
  duration_ms?: number
  records?:    number
  exit_code?:  number
  output?:     string
  command?:    string
  context?:    import('../../services/llm/run-context').RunContext
}

interface MonitorRow {
  id: string; client_id: string; active: boolean
  expected_min: number | null; expected_max: number | null
}

// ─── Logique partagée : valide la sortie + enqueue le ping ────────────────────
// Renvoie le statut final (peut être reclassé fail par l'output validation).

async function enqueuePing(monitor: MonitorRow, data: PingData): Promise<'success' | 'fail'> {
  let { status } = data
  const { records } = data

  if (
    status === 'success' && records !== undefined &&
    monitor.expected_min !== null && monitor.expected_max !== null &&
    (records < monitor.expected_min || records > monitor.expected_max)
  ) {
    status = 'fail'
    logger.warn('[Ping] Output validation failed', { records, monitorId: monitor.id })
  }

  try {
    await pingQueue.add('ping', {
      monitorId: monitor.id, clientId: monitor.client_id, status,
      durationMs: data.duration_ms, records,
      // Secrets masqués DÈS l'entrée : la file Redis, la base, la file des échecs et les alertes ne
      // voient jamais un mot de passe ou un jeton présent dans la sortie du job ou sa commande.
      exitCode: data.exit_code, output: data.output && sanitizeLogs(data.output).clean,
      command: data.command && sanitizeLogs(data.command).clean, runContext: withScriptRisks(data.context),
    })
  } catch (e) {
    // Redis down : le ping ne peut pas être enregistré. Loggue + rethrow → la route
    // renvoie une erreur (fail-loud) au lieu d'un 200 silencieux qui ferait croire au
    // cron que tout va bien alors que le ping (et son éventuel échec) est perdu.
    logger.error('[Ping] enqueue échoué — ping NON enregistré (Redis down ?)',
      { monitorId: monitor.id, err: (e as Error).message })
    throw e
  }

  return status
}

/** Remplace le texte du script par les risques qu'il contient (ids) : le script ne quitte jamais cette requête. */
function withScriptRisks(ctx: PingData['context'] & { script?: { path: string; text?: string; risks?: string[] } } | undefined) {
  if (!ctx?.script?.text) return ctx
  const { path, text } = ctx.script
  return { ...ctx, script: { path, risks: lintScript(text, path).map(f => f.id) } }
}

async function findMonitor(pingKey: string): Promise<MonitorRow | null> {
  const { rows: [monitor] } = await db.query(
    `SELECT id, client_id, active, expected_min, expected_max FROM monitors WHERE ping_key = $1`,
    [pingKey]
  )
  return monitor ?? null
}

// ─── POST /ping/:pingKey — payload JSON complet ───────────────────────────────

pingRouter.post('/:pingKey', limiter, asyncHandler(async (req, res) => {
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
  }

  const monitor = await findMonitor(req.params.pingKey)
  if (!monitor)        return res.status(404).json({ error: 'Monitor not found' })
  if (!monitor.active) return res.json({ ok: true, skipped: true })

  const status = await enqueuePing(monitor, parsed.data)
  return res.json({ ok: true, status })
}))

// ─── GET|POST /ping/:pingKey/:status — variante bash, sans JSON ──────────────
// Healthchecks-style. Exemples :
//   curl host/ping/KEY/0          → success  (exit code 0)
//   curl host/ping/KEY/$?         → success si $?=0, sinon fail
//   curl host/ping/KEY/fail       → fail
//   curl "host/ping/KEY/success?duration_ms=1200"
// La durée optionnelle passe par query string.

const urlPingHandler = asyncHandler(async (req, res) => {
  const raw = String(req.params.status).toLowerCase()

  // ── /start : marque le job comme "en cours" (détection hung) ───────────────
  if (raw === 'start') {
    const monitor = await findMonitor(req.params.pingKey)
    if (!monitor)        return res.status(404).json({ error: 'Monitor not found' })
    if (!monitor.active) return res.json({ ok: true, skipped: true })
    await db.query(
      `UPDATE monitors SET last_start_at = NOW(), hung_alerted = false WHERE id = $1`,
      [monitor.id]
    )
    return res.json({ ok: true, status: 'running' })
  }

  let status: 'success' | 'fail'
  let exit_code: number | undefined
  if (raw === 'success' || raw === 'ok')   status = 'success'
  else if (raw === 'fail' || raw === 'down') status = 'fail'
  else if (/^-?\d+$/.test(raw)) {
    exit_code = parseInt(raw, 10)
    status    = exit_code === 0 ? 'success' : 'fail'
  } else {
    return res.status(400).json({ error: "status doit être 'success', 'fail', 'start' ou un exit code numérique" })
  }

  // Durée optionnelle via query (?duration_ms=1200) — ignorée si invalide
  let duration_ms: number | undefined
  const d = parseInt(String(req.query.duration_ms ?? ''), 10)
  if (Number.isFinite(d) && d > 0 && d <= 86_400_000) duration_ms = d

  const monitor = await findMonitor(req.params.pingKey)
  if (!monitor)        return res.status(404).json({ error: 'Monitor not found' })
  if (!monitor.active) return res.json({ ok: true, skipped: true })

  const finalStatus = await enqueuePing(monitor, { status, exit_code, duration_ms })
  return res.json({ ok: true, status: finalStatus })
})

pingRouter.get('/:pingKey/:status',  limiter, urlPingHandler)
pingRouter.post('/:pingKey/:status', limiter, urlPingHandler)
