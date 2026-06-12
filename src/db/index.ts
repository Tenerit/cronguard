import { Pool } from 'pg'

// ─── Pool de connexion PostgreSQL ─────────────────────────────────────────────

export const db = new Pool({
  connectionString:        process.env.DATABASE_URL,
  max:                     20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
})

// initDb() — vérifie la connexion ET applique les migrations au démarrage.
// Les migrations sont idempotentes (IF NOT EXISTS) : safe à lancer à chaque démarrage.
export async function initDb(): Promise<void> {
  await db.query('SELECT 1')
  const { runMigrations } = await import('./migrations')
  await runMigrations()
}
