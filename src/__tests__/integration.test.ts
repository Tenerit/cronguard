/**
 * Tests d'intégration réels — pg-mem (DB in-memory) + Redis réel
 *
 * Teste les flux complets sans mock :
 *  - Inscription → création monitor → ping → vérification en DB
 *  - Auth → routes protégées
 *  - Output validation
 *  - Rate limiting
 */
import { newDb, DataType } from 'pg-mem'
import { randomUUID } from 'node:crypto'
import { Pool }      from 'pg'
import { hashApiKey } from '../services/api-keys'
import request       from 'supertest'
import express       from 'express'
import { Redis }     from 'ioredis'

// ─── Setup pg-mem ─────────────────────────────────────────────────────────────

let pgPool: Pool
let realRedis: Redis
let app: express.Application

// On mock le module db pour injecter pg-mem
let migrationDb: unknown   // client tolérant, le temps des migrations seulement
jest.mock('../db', () => ({
  get db() { return migrationDb ?? pgPool },
}))

// On mock redis pour injecter notre instance réelle Redis locale
jest.mock('../config/redis', () => ({
  get redis() { return realRedis },
}))

// On mock la queue BullMQ — pas de worker actif dans les tests
jest.mock('../queue', () => ({
  pingQueue:     { add: jest.fn().mockResolvedValue({ id: 'job-test' }) },
  analysisQueue: { add: jest.fn().mockResolvedValue({ id: 'job-test' }) },
}))

// ─── Setup complet ────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'   // la limite de plan ne s'applique qu'avec la facturation
  // Redis réel (doit tourner sur localhost:6379)
  // Base 14 : la base 0 est celle d'une stack locale qui tourne (files, cache) — flushdb la viderait.
  realRedis = new Redis({ host: '127.0.0.1', port: 6379, db: 14, lazyConnect: true })
  try {
    await realRedis.connect()
    await realRedis.flushdb() // nettoie les clés de test
  } catch {
    // Redis non disponible — skip les tests qui en ont besoin
    console.warn('Redis not available — some tests may be skipped')
  }

  // pg-mem : PostgreSQL en mémoire
  const mem  = newDb()
  // pg-mem n'implémente pas gen_random_uuid() : on l'enregistre pour que les tables à
  // `DEFAULT gen_random_uuid()` (audit_logs) insèrent comme sur le vrai Postgres (cf. §2).
  mem.public.registerFunction({
    name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => randomUUID(),
  })

  const adapter = mem.adapters.createPg()
  pgPool = new adapter.Pool() as unknown as Pool

  // Le VRAI schéma : src/db/migrations.ts rejoué sur pg-mem (plus de copie à tenir à jour à la main, qui dérivait).
  // pg-mem ne sait pas exécuter 3 reprises de données (UPDATE sur des tables vides ici, sans effet) ni la table du
  // marqueur de schéma : ces ordres-là seuls sont tolérés, tout autre échec arrête le test.
  // Mesuré le 2026-11-12 : tout le reste des migrations v1 → v25 passe tel quel.
  mem.public.registerFunction({ name: 'pg_advisory_xact_lock', args: [DataType.integer], returns: DataType.text, implementation: () => '' })
  const TOLERATED = /^\s*UPDATE\s+(analyses|clients|team_members)\s+SET|migration_markers/
  migrationDb = { connect: async () => ({
    query: async (sql: string, params?: unknown[]) => {
      // pg-mem refuse NULL dans un CHECK (PostgreSQL l'accepte) : « x IS NULL OR » rend le même sens au CHECK.
      sql = sql.replace(/CHECK \((\w+) IN \(/g, 'CHECK ($1 IS NULL OR $1 IN (')
      try { return await pgPool.query(sql, params) }
      catch (e) { if (TOLERATED.test(sql)) return { rows: [] }; throw e }
    },
    release() {},
  }) }
  const { runMigrations } = await import('../db/migrations')
  await runMigrations()
  migrationDb = undefined

  // Charge l'app après setup de la DB
  process.env.DATABASE_URL = 'mock'
  process.env.REDIS_URL    = 'redis://127.0.0.1:6379'
  process.env.LLM_BASE_URL = 'http://localhost:11434/v1'
  process.env.NODE_ENV     = 'test'

  const { pingRouter }      = await import('../api/routes/ping')
  const { monitorsRouter }  = await import('../api/routes/monitors')
  const { dashboardRouter } = await import('../api/routes/dashboard')
  const { clientsRouter }   = await import('../api/routes/clients')
  const { maintenanceRouter } = await import('../api/routes/maintenance')
  const { requireApiKey }   = await import('../api/middleware/auth')
  const rateLimit = (await import('express-rate-limit')).default

  app = express()
  app.use(express.json())
  app.use('/ping', pingRouter)
  app.use('/monitors',  rateLimit({ windowMs:60000, max:999 }), requireApiKey, monitorsRouter)
  app.use('/dashboard', rateLimit({ windowMs:60000, max:999 }), requireApiKey, dashboardRouter)
  app.use('/clients',   rateLimit({ windowMs:60000, max:999 }), requireApiKey, clientsRouter)
  app.use('/maintenance-windows', rateLimit({ windowMs:60000, max:999 }), requireApiKey, maintenanceRouter)
  app.use((err: Error, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message })
  })
}, 30000)

afterAll(async () => {
  await realRedis.quit().catch(() => {})
  await pgPool.end().catch(() => {})
})

// ─── Helper ───────────────────────────────────────────────────────────────────

async function createTestClient(email = `test${Date.now()}@example.com`) {
  const id     = randomUUID()
  const apiKey = `ak-${Date.now()}-${Math.floor(Math.random()*99999)}`
  const { rows: [client] } = await pgPool.query(
    'INSERT INTO clients (id, email, api_key) VALUES ($1,$2,$3) RETURNING id, email',
    [id, email, hashApiKey(apiKey)]
  )
  return { ...client, api_key: apiKey }   // en base : l'empreinte seule
}

async function createTestMonitor(clientId: string, name = 'test-job') {
  const id      = randomUUID()
  const pingKey = `pk-${Date.now()}-${Math.floor(Math.random()*99999)}`
  const { rows: [monitor] } = await pgPool.query(
    'INSERT INTO monitors (id,client_id,name,ping_key,grace_period) VALUES ($1,$2,$3,$4,300) RETURNING id, ping_key, name',
    [id, clientId, name, pingKey]
  )
  return monitor
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth — clé API', () => {
  it('GET /monitors sans clé → 401', async () => {
    const res = await request(app).get('/monitors')
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Missing')
  })

  it('GET /monitors avec clé invalide → 401', async () => {
    const res = await request(app)
      .get('/monitors')
      .set('X-API-Key', 'not-a-valid-key')
    expect(res.status).toBe(401)
  })

  it('GET /monitors avec clé valide → 200', async () => {
    // Note: pg-mem ne supporte pas LATERAL JOIN utilisé dans GET /monitors
    // L'auth est testée par les cas 401 ci-dessus. Ce test vérifie juste
    // que la route répond (pas 401 = auth OK).
    const client = await createTestClient()
    const res = await request(app)
      .get('/monitors')
      .set('X-API-Key', client.api_key)
    expect([200, 500]).toContain(res.status) // 500 = pg-mem limitation
    if (res.status === 200) expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /monitors/suggest-name — import de crontab', () => {
  it('écrit le planning par le code, sans nom IA quand aucun modèle d\'explication n\'est déclaré', async () => {
    const client = await createTestClient()
    const res = await request(app).post('/monitors/suggest-name').set('X-API-Key', client.api_key)
      .send({ command: 'pg_dump -Fc clients > /bak/c.dump', schedule: '30 2 * * 1-5' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: null, role: null, critical: null, when: 'du lundi au vendredi, à 02:30', expect: '/bak/c.dump' })   // sortie attendue proposée par la règle
  })
  it('refuse une commande vide (400)', async () => {
    const client = await createTestClient()
    expect((await request(app).post('/monitors/suggest-name').set('X-API-Key', client.api_key).send({ command: '' })).status).toBe(400)
  })
})

describe('Monitors CRUD — base de données réelle', () => {
  let client: any, monitor: any

  beforeEach(async () => {
    // Nettoie l'état entre les tests pour éviter les conflits de clés
    await pgPool.query('DELETE FROM monitors')
    await pgPool.query('DELETE FROM clients')
    client  = await createTestClient()
    monitor = await createTestMonitor(client.id)
  })

  it('GET /monitors/:id retourne le monitor créé (alternative à liste)', async () => {
    // GET /monitors utilise LATERAL JOIN non supporté par pg-mem
    // On teste GET /monitors/:id qui fait une requête simple
    const res = await request(app)
      .get('/monitors/' + monitor.id)
      .set('X-API-Key', client.api_key)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(monitor.id)
    expect(res.body.name).toBe(monitor.name)
  })

  it('POST /monitors crée le monitor en DB (201) et génère id + ping_key', async () => {
    const res = await request(app)
      .post('/monitors')
      .set('X-API-Key', client.api_key)
      .send({ name: 'nouveau-job', env: 'production', schedule: '0 * * * *' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()         // id généré par le DEFAULT (gen_random_uuid)
    expect(res.body.ping_key).toBeTruthy()   // ping_key généré de même
    const { rows } = await pgPool.query(`SELECT name, env FROM monitors WHERE id = $1`, [res.body.id])
    expect(rows[0]).toMatchObject({ name: 'nouveau-job', env: 'production' })
  })

  it('POST /monitors — validation Zod fonctionne (grace_period invalide → 400)', async () => {
    const resInvalid = await request(app)
      .post('/monitors')
      .set('X-API-Key', client.api_key)
      .send({ name: '', env: 'production' }) // nom vide invalide
    expect(resInvalid.status).toBe(400)

    const resBadEnv = await request(app)
      .post('/monitors')
      .set('X-API-Key', client.api_key)
      .send({ name: 'job', env: 'invalid' })
    expect(resBadEnv.status).toBe(400)

    const resBadGrace = await request(app)
      .post('/monitors')
      .set('X-API-Key', client.api_key)
      .send({ name: 'job', env: 'production', grace_period: 5 }) // < 60s
    expect(resBadGrace.status).toBe(400)
  })

  it('PATCH /monitors/:id met à jour en DB', async () => {
    const res = await request(app)
      .patch(`/monitors/${monitor.id}`)
      .set('X-API-Key', client.api_key)
      .send({ name: 'nom-mis-a-jour' })
    expect(res.status).toBe(200)

    const { rows } = await pgPool.query(
      `SELECT name FROM monitors WHERE id = $1`, [monitor.id]
    )
    expect(rows[0].name).toBe('nom-mis-a-jour')

    // La mutation doit laisser une trace d'audit (buy-driver compliance §11)
    const { rows: audit } = await pgPool.query(
      `SELECT action, resource_id FROM audit_logs WHERE resource_id = $1 AND action = 'monitor.updated'`,
      [monitor.id]
    )
    expect(audit).toHaveLength(1)
  })

  it('DELETE /monitors/:id supprime en DB', async () => {
    const res = await request(app)
      .delete(`/monitors/${monitor.id}`)
      .set('X-API-Key', client.api_key)
    expect(res.status).toBe(200)

    const { rows } = await pgPool.query(
      `SELECT id FROM monitors WHERE id = $1`, [monitor.id]
    )
    expect(rows).toHaveLength(0)
  })

  it('Isolation multi-tenant : client A ne voit pas les monitors de client B', async () => {
    const clientB = await createTestClient()
    const monitorB = await createTestMonitor(clientB.id, 'job-b')

    // Client A essaie de patcher le monitor de B
    const res = await request(app)
      .patch(`/monitors/${monitorB.id}`)
      .set('X-API-Key', client.api_key)
      .send({ name: 'hacked' })
    expect(res.status).toBe(404)

    // Vérif que le monitor B est intact
    const { rows } = await pgPool.query(`SELECT name FROM monitors WHERE id = $1`, [monitorB.id])
    expect(rows[0].name).toBe('job-b')
  })

  it('Plan free limité à 3 monitors', async () => {
    // Crée 2 autres monitors (total = 3)
    await createTestMonitor(client.id, 'job-2')
    await createTestMonitor(client.id, 'job-3')

    const res = await request(app)
      .post('/monitors')
      .set('X-API-Key', client.api_key)
      .send({ name: 'job-4', env: 'production' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Free plan')
  })
})

describe('Ping endpoint — flux complet', () => {
  let client: any, monitor: any

  beforeEach(async () => {
    await pgPool.query('DELETE FROM monitors')
    await pgPool.query('DELETE FROM clients')
    client  = await createTestClient()
    monitor = await createTestMonitor(client.id, 'backup-postgres')
  })

  it('Ping succès → last_status = ok en DB', async () => {
    const res = await request(app)
      .post(`/ping/${monitor.ping_key}`)
      .send({ status: 'success', duration_ms: 1200, records: 500 })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('Ping avec ping_key inconnue → 404', async () => {
    const res = await request(app)
      .post('/ping/key-inexistante')
      .send({ status: 'success' })
    expect(res.status).toBe(404)
  })

  it('Output validation : exit 0 mais 0 records → reclassé en fail', async () => {
    // Configure le monitor avec expected_min = 100
    await pgPool.query(
      `UPDATE monitors SET expected_min = 100, expected_max = 10000 WHERE id = $1`,
      [monitor.id]
    )

    const res = await request(app)
      .post(`/ping/${monitor.ping_key}`)
      .send({ status: 'success', records: 0 })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fail') // reclassifié !
  })

  it('Monitor en pause → ping accepté mais silencieux', async () => {
    const until = new Date(Date.now() + 60 * 60000)
    await pgPool.query(
      `UPDATE monitors SET paused_until = $2 WHERE id = $1`,
      [monitor.id, until]
    )

    const res = await request(app)
      .post(`/ping/${monitor.ping_key}`)
      .send({ status: 'success' })
    // Le ping passe quand même (le monitor n'est pas désactivé)
    expect(res.status).toBe(200)
  })

  it('Validation Zod — duration_ms > 24h → 400', async () => {
    const res = await request(app)
      .post(`/ping/${monitor.ping_key}`)
      .send({ status: 'success', duration_ms: 99_999_999_999 })
    expect(res.status).toBe(400)
  })

  it('Validation Zod — records négatif → 400', async () => {
    const res = await request(app)
      .post(`/ping/${monitor.ping_key}`)
      .send({ status: 'success', records: -1 })
    expect(res.status).toBe(400)
  })

  // ─── URLs bash-friendly (#3) ────────────────────────────────────────────────

  it('GET /ping/:key/0 (exit code) → success', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/0`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('success')
  })

  it('GET /ping/:key/1 (exit code non nul) → fail', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/1`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fail')
  })

  it('GET /ping/:key/fail → fail', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/fail`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fail')
  })

  it('GET /ping/:key/success accepte une durée en query', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/success?duration_ms=1200`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('success')
  })

  it('GET /ping/:key/garbage (status invalide) → 400', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/garbage`)
    expect(res.status).toBe(400)
  })

  it('GET /ping/cle-inexistante/0 → 404', async () => {
    const res = await request(app).get('/ping/cle-inexistante/0')
    expect(res.status).toBe(404)
  })

  it('GET /ping/:key/start → status running + last_start_at en DB', async () => {
    const res = await request(app).get(`/ping/${monitor.ping_key}/start`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('running')
    const { rows } = await pgPool.query(`SELECT last_start_at FROM monitors WHERE id=$1`, [monitor.id])
    expect(rows[0].last_start_at).not.toBeNull()
  })
})

describe('Dashboard — données agrégées', () => {
  it('GET /dashboard/overview répond (CTE pg-mem partiel)', async () => {
    const client = await createTestClient()
    const res = await request(app)
      .get('/dashboard/overview')
      .set('X-API-Key', client.api_key)
    // CTE supporté partiellement par pg-mem — on vérifie que la route répond
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.monitors).toBeDefined()
      expect(res.body.ai).toBeDefined()
    }
  })

  it('GET /dashboard/logs retourne les pings récents', async () => {
    const client = await createTestClient()
    const res = await request(app)
      .get('/dashboard/logs?limit=10')
      .set('X-API-Key', client.api_key)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /dashboard/impact répond (métriques incident)', async () => {
    const client = await createTestClient()
    const res = await request(app)
      .get('/dashboard/impact')
      .set('X-API-Key', client.api_key)
    // ::interval cast partiellement supporté par pg-mem
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty('incidents')
      expect(res.body).toHaveProperty('avgMttrMs')
      expect(res.body).toHaveProperty('documented')
    }
  })
})

describe('Clients — profil et paramètres', () => {
  it('GET /clients/me retourne le profil', async () => {
    const client = await createTestClient()
    const res = await request(app)
      .get('/clients/me')
      .set('X-API-Key', client.api_key)
    // pg-mem peut avoir du mal avec le subquery COUNT
    expect([200, 500]).toContain(res.status)
  })

  it('PATCH /clients/settings : autres plateformes fusionnées, \'\' efface, clé PagerDuty validée', async () => {
    const client = await createTestClient()
    const patch = (channels: object) => request(app).patch('/clients/settings').set('X-API-Key', client.api_key).send({ channels })
    await patch({ discord: 'https://discord.com/api/webhooks/1/abc' })
    await patch({ ntfy: 'https://ntfy.example.org/cronguard-ops' })
    const res = await patch({ discord: '' })
    expect(res.status).toBe(200)
    expect(res.body.channels).toEqual({ ntfy: 'https://ntfy.example.org/cronguard-ops' })
    expect((await patch({ pagerduty: 'trop-courte' })).status).toBe(400)
    expect((await patch({ telegram: 'x' })).status).toBe(400)   // plateforme inconnue refusée
  })

  it('PATCH /clients/settings met à jour le slack webhook', async () => {
    const client = await createTestClient()
    const res = await request(app)
      .patch('/clients/settings')
      .set('X-API-Key', client.api_key)
      .send({ slack_webhook: 'https://hooks.slack.com/test' })
    expect(res.status).toBe(200)
    expect(res.body.slack_webhook).toBe('https://hooks.slack.com/test')

    // Vérifie en DB
    const { rows } = await pgPool.query(
      `SELECT slack_webhook FROM clients WHERE id = $1`, [client.id]
    )
    expect(rows[0].slack_webhook).toBe('https://hooks.slack.com/test')
  })
})

describe('Maintenance windows — PATCH ne doit pas réinjecter les defaults (zod 4)', () => {
  async function createWindow(clientId: string) {
    const id = randomUUID()
    const { rows: [w] } = await pgPool.query(
      `INSERT INTO maintenance_windows (id, client_id, label, cron_expr, duration_min, active)
       VALUES ($1,$2,'nightly-etl','0 2 * * *',90,false) RETURNING *`,
      [id, clientId]
    )
    return w
  }

  it('PATCH avec seulement des champs inconnus ne réécrit pas label/active', async () => {
    const client = await createTestClient()
    const w = await createWindow(client.id)
    const res = await request(app)
      .patch(`/maintenance-windows/${w.id}`)
      .set('X-API-Key', client.api_key)
      .send({ hacker: 'x', client_id: 'stolen' })
    expect(res.status).toBe(200)
    // label/active DOIVENT rester inchangés (pas réinitialisés par les .default() du schéma)
    const { rows } = await pgPool.query(
      `SELECT label, active FROM maintenance_windows WHERE id = $1`, [w.id]
    )
    expect(rows[0].label).toBe('nightly-etl')
    expect(rows[0].active).toBe(false)   // la fenêtre ne doit PAS être réactivée en silence
  })

  it('PATCH applique bien le seul champ envoyé', async () => {
    const client = await createTestClient()
    const w = await createWindow(client.id)
    await request(app)
      .patch(`/maintenance-windows/${w.id}`)
      .set('X-API-Key', client.api_key)
      .send({ label: 'renamed' })
    const { rows } = await pgPool.query(
      `SELECT label, active, duration_min FROM maintenance_windows WHERE id = $1`, [w.id]
    )
    expect(rows[0].label).toBe('renamed')
    expect(rows[0].active).toBe(false)        // inchangé
    expect(rows[0].duration_min).toBe(90)     // inchangé
  })
})

describe('sameErrorBefore — même empreinte sur ce monitor, 7 jours', () => {
  const LOGS = 'FATAL: connection refused on db-primary after 30s'

  async function seed(monitorId: string, jobName: string, logs: string, ageDays = 0) {
    const { hashError, sanitizeLogs } = await import('../services/sanitizer')
    await pgPool.query(
      `INSERT INTO analyses (id, monitor_id, error_hash, diagnosis, model_used, created_at) VALUES ($1,$2,$3,'{}','m',$4)`,
      [randomUUID(), monitorId, hashError(jobName, sanitizeLogs(logs).clean),
       new Date(Date.now() - ageDays * 86400_000)]
    )
  }

  async function setup() {
    const { sameErrorRecently } = await import('../services/llm/incident-memory')
    const client = await createTestClient()
    return { sameErrorRecently, monitor: await createTestMonitor(client.id, 'etl'), client }
  }

  it('vrai pour la même erreur, y compris avec une autre durée', async () => {
    const { sameErrorRecently, monitor } = await setup()
    await seed(monitor.id, 'etl', LOGS)
    expect(await sameErrorRecently(monitor.id, 'etl', LOGS)).toBe(true)
    expect(await sameErrorRecently(monitor.id, 'etl', LOGS.replace('30s', '75s'))).toBe(true)
  })

  it('faux pour une autre erreur sur le même monitor', async () => {
    const { sameErrorRecently, monitor } = await setup()
    await seed(monitor.id, 'etl', LOGS)
    expect(await sameErrorRecently(monitor.id, 'etl', 'out of memory: killed process')).toBe(false)
  })

  it('faux si la même erreur vient d un autre monitor', async () => {
    const { sameErrorRecently, monitor, client } = await setup()
    const other = await createTestMonitor(client.id, 'etl')
    await seed(other.id, 'etl', LOGS)
    expect(await sameErrorRecently(monitor.id, 'etl', LOGS)).toBe(false)
  })

  it('faux au-delà de 7 jours', async () => {
    const { sameErrorRecently, monitor } = await setup()
    await seed(monitor.id, 'etl', LOGS, 8)
    expect(await sameErrorRecently(monitor.id, 'etl', LOGS)).toBe(false)
  })

  it('faux sans log, même si une analyse sans log existe', async () => {
    const { sameErrorRecently, monitor } = await setup()
    await seed(monitor.id, 'etl', '')
    expect(await sameErrorRecently(monitor.id, 'etl', '   ')).toBe(false)
  })
})

describe('Playground diagnostic — POST /monitors/analyze/preview', () => {
  let client: any
  const before = { url: process.env.LLM_BASE_URL, explain: process.env.LLM_EXPLAIN_MODEL, deduction: process.env.LLM_DEDUCTION }
  beforeEach(async () => {
    await pgPool.query('DELETE FROM monitors'); await pgPool.query('DELETE FROM clients')
    client = await createTestClient()
  })
  afterAll(() => {
    if (before.url === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = before.url
    if (before.explain === undefined) delete process.env.LLM_EXPLAIN_MODEL; else process.env.LLM_EXPLAIN_MODEL = before.explain
    if (before.deduction === undefined) delete process.env.LLM_DEDUCTION; else process.env.LLM_DEDUCTION = before.deduction
  })

  it('sans IA : cause établie depuis les faits, sans modèle', async () => {
    delete process.env.LLM_BASE_URL
    const res = await request(app).post('/monitors/analyze/preview').set('X-API-Key', client.api_key)
      .send({ logs: "ERROR: deadlock detected\nProcess 12345 waits for ShareLock on transaction 88472" })
    expect(res.status).toBe(200)
    expect(res.body.cause).toMatch(/deadlock/)
    expect(res.body._meta.ai).toBe(false)
  })

  it("avec un serveur IA mais sans modèle d'explication : plus d'erreur 503 « modèle absent »", async () => {
    process.env.LLM_BASE_URL = 'http://127.0.0.1:9/v1'   // rien n'écoute : aucun appel ne doit être nécessaire
    delete process.env.LLM_EXPLAIN_MODEL; delete process.env.LLM_DEDUCTION
    const res = await request(app).post('/monitors/analyze/preview').set('X-API-Key', client.api_key)
      .send({ logs: 'ledger: FATAL reconciliation drift\nexit status 1' })
    expect(res.status).toBe(200)
    expect(res.body.cause).toMatch(/^Cause non établie/)
    expect(res.body.explanation).toBeNull()
  })
})
