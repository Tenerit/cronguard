/**
 * CronGuard — Migrations base de données
 *
 * Toutes les migrations dans un seul fichier, exécutées en ordre.
 * Chaque migration est idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *
 * Usage : node dist/db/migrations.js
 *         ou via npm run db:migrate
 */
import 'dotenv/config'

import { db }     from './index'
import { logger } from '../config/logger'

// ─── V1 : Schéma initial ─────────────────────────────────────────────────────

async function v1(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      stripe_id   TEXT UNIQUE,
      plan        TEXT NOT NULL DEFAULT 'free',
      api_key     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS monitors (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      ping_key     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
      schedule     TEXT,
      grace_period INT NOT NULL DEFAULT 300,
      expected_min INT,
      expected_max INT,
      env          TEXT NOT NULL DEFAULT 'production',
      active       BOOLEAN DEFAULT TRUE,
      last_ping_at TIMESTAMPTZ,
      last_status  TEXT DEFAULT 'unknown',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS pings (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id  UUID REFERENCES monitors(id) ON DELETE CASCADE,
      status      TEXT NOT NULL,
      duration_ms INT,
      output      TEXT,
      records     INT,
      exit_code   INT,
      pinged_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id  UUID REFERENCES monitors(id) ON DELETE CASCADE,
      ping_id     UUID REFERENCES pings(id) ON DELETE SET NULL,
      error_hash  TEXT NOT NULL,
      diagnosis   TEXT NOT NULL,
      model_used  TEXT NOT NULL,
      alert_type  TEXT NOT NULL DEFAULT 'fail',
      severity    TEXT NOT NULL DEFAULT 'medium',
      from_cache  BOOLEAN NOT NULL DEFAULT false,
      tokens_in   INT DEFAULT 0,
      tokens_out  INT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`CREATE INDEX IF NOT EXISTS idx_pings_monitor   ON pings(monitor_id, pinged_at DESC)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_analyses_hash   ON analyses(error_hash, created_at DESC)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active, last_status)`)
}

// ─── V2 : Stripe + colonnes supplémentaires ───────────────────────────────────

async function v2(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id                UUID REFERENCES clients(id) ON DELETE CASCADE,
      stripe_subscription_id   TEXT UNIQUE NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'active',
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Colonnes optionnelles ajoutées progressivement
  await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS slack_webhook TEXT`)
  await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS app_url       TEXT`)
  await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_id     TEXT`)
}

// ─── V3 : Alert deduplication ────────────────────────────────────────────────

async function v3(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS alert_states (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id   UUID REFERENCES monitors(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'firing',
      first_fired  TIMESTAMPTZ DEFAULT NOW(),
      last_alerted TIMESTAMPTZ DEFAULT NOW(),
      snooze_until TIMESTAMPTZ,
      alert_count  INT DEFAULT 1,
      UNIQUE (monitor_id)
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_alert_states_monitor ON alert_states(monitor_id, status)
  `)
}

// ─── V4 : Trial, pause, reset token, audit logs, rétention ───────────────────

async function v4(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // Trial Pro + pause temporaire + reset clé API
  await client.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reset_token     TEXT,
      ADD COLUMN IF NOT EXISTS reset_token_exp TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS first_ping_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS onboarding_sent BOOLEAN DEFAULT false
  `)

  // Pause temporaire d'un monitor (maintenance planifiée)
  await client.query(`
    ALTER TABLE monitors
      ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ
  `)

  // Logs d'audit : qui a fait quoi, quand
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
      action      TEXT NOT NULL,
      resource    TEXT NOT NULL,
      resource_id TEXT,
      meta        JSONB DEFAULT '{}',
      ip          TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_logs(client_id, created_at DESC)
  `)
}



// ─── V5 : Analyse IA enrichie + feedback utilisateur ─────────────────────────

async function v5(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // Catégorie d'erreur (db/réseau/timeout/ressources/dépendance/code)
  await client.query(`
    ALTER TABLE analyses
      ADD COLUMN IF NOT EXISTS category   TEXT,
      ADD COLUMN IF NOT EXISTS prevention TEXT,
      ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IN ('high','medium','low')),
      ADD COLUMN IF NOT EXISTS user_feedback TEXT CHECK (user_feedback IN ('positive','negative')),
      ADD COLUMN IF NOT EXISTS correlated_monitors JSONB
  `)

  // Index pour retrouver vite les analyses positives (few-shot examples)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_analyses_feedback
      ON analyses(monitor_id, user_feedback, created_at DESC)
  `)
}

// ─── V6 : Champs analyse enrichis ────────────────────────────────────────────

async function v6(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`
    ALTER TABLE analyses
      ADD COLUMN IF NOT EXISTS checks        JSONB,
      ADD COLUMN IF NOT EXISTS data_impact   TEXT CHECK (data_impact IN ('none','possible','confirmed')),
      ADD COLUMN IF NOT EXISTS fix_minutes   SMALLINT
  `)
}

// ─── V7 : Webhook générique de notification ──────────────────────────────────

async function v7(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // URL webhook générique (Discord, Teams, PagerDuty, custom...) : reçoit le
  // payload JSON d'alerte. Complète slack_webhook (format spécifique Slack).
  await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS webhook_url TEXT`)
}

// ─── V8 : Détection des jobs "hung" (démarré, jamais terminé) ─────────────────

async function v8(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // last_start_at : posé par un ping /start, effacé à la complétion (success/fail).
  // hung_alerted  : évite de ré-alerter chaque minute pour le même run bloqué.
  await client.query(`
    ALTER TABLE monitors
      ADD COLUMN IF NOT EXISTS last_start_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS hung_alerted  BOOLEAN DEFAULT false
  `)
}

// ─── V9 : Historique des incidents (clés pour le MTTR / preuve de valeur) ─────

async function v9(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // Un incident = période entre la 1ère alerte d'un monitor et son rétablissement.
  // Persisté à la résolution (alert_states est supprimé) → permet MTTR, downtime,
  // récurrences, taux de perte de données. C'est la métrique qui prouve la valeur.
  await client.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id   UUID REFERENCES monitors(id) ON DELETE CASCADE,
      started_at   TIMESTAMPTZ NOT NULL,
      resolved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration_ms  BIGINT,
      alert_count  INT DEFAULT 1,
      severity     TEXT,
      category     TEXT,
      data_impact  TEXT,
      root_cause   TEXT,
      analysis_id  UUID REFERENCES analyses(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents(monitor_id, resolved_at DESC)`)
}

// ─── V10 : Escalade (2ᵉ contact si alerte non acquittée sous N min) ───────────

async function v10(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // Config escalade sur le compte (email + webhook dédiés, délai configurable)
  await client.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS escalation_email       TEXT,
      ADD COLUMN IF NOT EXISTS escalation_webhook     TEXT,
      ADD COLUMN IF NOT EXISTS escalation_after_min   INT NOT NULL DEFAULT 30
  `)
  // Timestamp pour ne pas ré-escalader sur chaque tick du checker
  await client.query(`
    ALTER TABLE alert_states
      ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ
  `)
}

// ─── V11 : Fenêtres de maintenance récurrentes ───────────────────────────────

async function v11(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // monitor_id NULL = s'applique à tous les monitors du client
  await client.query(`
    CREATE TABLE IF NOT EXISTS maintenance_windows (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
      monitor_id   UUID REFERENCES monitors(id) ON DELETE CASCADE,
      label        TEXT NOT NULL DEFAULT '',
      cron_expr    TEXT NOT NULL,
      duration_min INT  NOT NULL DEFAULT 60,
      active       BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_maint_client ON maintenance_windows(client_id, active)
  `)
}

export async function runMigrations() {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await v1(client)
    await v2(client)
    await v3(client)
    await v4(client)
    await v5(client)
    await v6(client)
    await v7(client)
    await v8(client)
    await v9(client)
    await v10(client)
    await v11(client)
    await client.query('COMMIT')
    logger.info('[DB] Migrations terminées (v1 → v11)')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => { logger.info('[DB] Done'); process.exit(0) })
    .catch(err => { logger.error('[DB] Migration failed', { err }); process.exit(1) })
}
