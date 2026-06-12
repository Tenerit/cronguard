// Variables d'environnement
// En mode local (DATABASE_URL absent), aucune infra n'est requise.
// En mode prod, DATABASE_URL + REDIS_URL + LLM_BASE_URL sont obligatoires.

export function validateEnv(): void {
  const required: Record<string, string> = {
    DATABASE_URL: 'URL PostgreSQL',
    REDIS_URL:    'URL Redis',
    LLM_BASE_URL: 'URL LLM (Ollama/vLLM)',
  }
  const missing = Object.entries(required)
    .filter(([k]) => !process.env[k])
    .map(([k, d]) => `  ${k.padEnd(25)} — ${d}`)

  if (missing.length) {
    console.error('\n❌ Variables manquantes :\n' + missing.join('\n'))
    console.error('\nCopiez .env.example → .env et renseignez les valeurs.\n')
    process.exit(1)
  }

  const defaults: Record<string, string> = {
    PORT: '3000', NODE_ENV: 'development',
    LLM_MODEL: 'llama3.2:3b',
    LLM_MAX_TOKENS: '512', LLM_TIMEOUT_MS: '60000',
    LLM_GLOBAL_RATE_LIMIT: '30', LLM_RATE_LIMIT_PER_CLIENT: '10',
    APP_URL: 'http://localhost:3000',
    ALLOWED_ORIGINS: 'http://localhost:3000',
  }
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k]) process.env[k] = v
  }
}
