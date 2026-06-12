# Contribuer à CronGuard

Merci de votre intérêt ! CronGuard est un monitoring de cron jobs avec analyse de
défaillance par LLM self-hosted. Ce guide couvre l'essentiel pour démarrer.

## Prérequis

- Node.js ≥ 18
- Docker + Docker Compose (Postgres, Redis, Ollama)

## Démarrage

```bash
git clone <repo>
cd cronguard
cp .env.example .env        # ajustez si besoin
npm install
docker compose up -d postgres redis ollama
npm run db:migrate
npm run seed                # compte démo + données réalistes
npm run dev:all             # API + workers + checker (hot reload)
```

Dashboard : http://localhost:3000/dashboard · clé API dans `.env.seed`.

## Tests

Deux runners — **les deux doivent passer** :

```bash
npm test                    # jest  (src/__tests__) — c'est ce que lance la CI
npx vitest run              # vitest (tests/) — logique pure + analyzer
```

- `npm test` a besoin de Redis (pour les tests d'intégration). Postgres est mocké
  via `pg-mem` ; certaines requêtes (LATERAL, CTE, `::interval`) y sont partiellement
  supportées → ces tests tolèrent `200` **ou** `500`.
- Toute nouvelle colonne DB doit être ajoutée **et** dans `src/db/migrations.ts`
  **et** dans le schéma `pg-mem` de `src/__tests__/integration.test.ts`.

## Architecture (survol)

```
API (Express)  → POST /ping/:key → Queue (BullMQ/Redis)
Workers
  ├── Ping processor   → DB, output validation, notif rétablissement
  ├── Analysis worker  → LLM (analyzer.ts), alertes, persistance incidents
  └── Timeout checker  → late (cron-aware) + hung + slowdown, 60s
LLM : Ollama local par défaut, ou tout endpoint OpenAI-compatible (LLM_API_KEY)
```

Le cœur de la valeur est le **pipeline de contexte** dans `analyzer.ts`
(`buildPrompt`) : historique 7j, corrélations multi-jobs, patterns temporels,
few-shot du feedback utilisateur. Le modèle est interchangeable.

## Conventions

- TypeScript strict — `npx tsc --noEmit` doit être propre.
- Migrations idempotentes (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), jamais
  de modification destructive d'une migration déjà publiée — ajoutez `vN+1`.
- Sécurité : ne jamais logguer de secret ; les logs envoyés au LLM passent par
  `sanitizeLogs`. Ne committez jamais `.env`.

## Pull requests

1. Branche depuis `main`.
2. `npm test` + `npx vitest run` + `npx tsc --noEmit` verts.
3. Décrivez le *pourquoi*, pas seulement le *quoi*.
4. Une PR = un sujet. Évitez d'élargir le scope.
