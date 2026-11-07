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

// ─── V12 : RBAC / multi-équipe ───────────────────────────────────────────────

async function v12(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  // Membres invités d'une équipe — clé API personnelle + rôle
  await client.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner','admin','member','viewer')),
      api_key     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
      invited_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (client_id, email)
    )
  `)

  // Invitations en attente
  await client.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('admin','member','viewer')),
      token       TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      accepted_at TIMESTAMPTZ,
      invited_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await client.query(`CREATE INDEX IF NOT EXISTS idx_invitations_token  ON invitations(token)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_team_members_key   ON team_members(api_key)`)
}

// ─── V13 : Acteur dans l'audit log (qui a agi — email SSO ou clé API) ─────────
async function v13(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor TEXT`)
}

// ─── V14 : Embedding pour la mémoire d'incidents (RAG few-shot) ───────────────
// real[] = float4[] natif PG (pas de pgvector → aucune extension requise). La
// similarité cosinus est calculée en application sur les incidents validés.
async function v14(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS embedding real[]`)
}

// ─── V15 : Runbook / notes opérateur par monitor (contexte injecté au LLM) ────
async function v15(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`ALTER TABLE monitors ADD COLUMN IF NOT EXISTS notes TEXT`)
}

// ─── V16 : cause/action en colonnes typées (étaient seulement dans le blob JSON
// `diagnosis`, parsé à la lecture côté serveur). Le blob reste écrit (contrat client
// dashboard). Backfill depuis le blob existant — PG16 `IS JSON` ignore les blobs
// dégradés (non-JSON) sans faire échouer la transaction.
// ─── V18 : clés API stockées en empreinte SHA-256 (une fuite de la base n'ouvre aucun compte).
// Idempotent : le préfixe sha256: marque les lignes déjà converties. Les clés en clair des
// utilisateurs restent valides : l'auth compare l'empreinte de la clé présentée.
async function v18(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  for (const t of ['clients', 'team_members']) {
    await client.query(`UPDATE ${t} SET api_key = 'sha256:' || encode(sha256(convert_to(api_key, 'UTF8')), 'hex')
                        WHERE api_key IS NOT NULL AND api_key NOT LIKE 'sha256:%'`)
  }
}

// ─── V17 : correction réellement appliquée, saisie par un humain (panne × cause × correction)
async function v17(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS verified_fix TEXT`)
  await client.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS fix_verified_at TIMESTAMPTZ`)
}

async function v16(client: {query(sql: string, params?: unknown[]): Promise<unknown>}) {
  await client.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS cause  TEXT`)
  await client.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS action TEXT`)
  await client.query(`
    UPDATE analyses
       SET cause  = diagnosis::jsonb->>'cause',
           action = diagnosis::jsonb->>'action'
     WHERE cause IS NULL AND diagnosis IS JSON
  `)
}

// Clé stable du verrou consultatif des migrations (arbitraire mais fixe).
const MIGRATION_LOCK_KEY = 947_218_314

export async function runMigrations() {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Sérialise les migrations entre les 4 process qui bootent en parallèle
    // (api + analysis/timeout/retention workers) → pas de course sur le DDL.
    // `_xact_` = relâché automatiquement au COMMIT/ROLLBACK (aucune fuite de verrou).
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY])
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
    await v12(client)
    await v13(client)
    await v14(client)
    await v15(client)
    await v16(client)
    await v17(client)
    await v18(client)
    await client.query('COMMIT')
    logger.info('[DB] Migrations terminées (v1 → v18)')
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
