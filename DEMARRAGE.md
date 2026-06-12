# CronGuard — Démarrage

## Prérequis

| Outil          | Version min | Télécharger                             |
|----------------|-------------|------------------------------------------|
| Node.js        | >= 18       | https://nodejs.org                       |
| Docker Desktop | Récente     | https://docs.docker.com/desktop/         |

Docker Desktop doit être **en cours d'exécution** avant de continuer.

---

## Installation (1 commande)

```bash
node setup.js          # Windows / macOS / Linux
.\setup.ps1            # Windows PowerShell uniquement
```

Ce script installe les dépendances, compile, démarre Docker (PostgreSQL + Redis + Ollama),
applique les migrations, télécharge le modèle LLM (~4.7 GB) et crée un compte de démo.

---

## Lancer l'application

```bash
# Option A — tout en 1 terminal
npm run dev:all

# Option B — 3 terminaux séparés
npm run dev            # API             → http://localhost:3000
npm run worker:dev     # Workers LLM
npm run checker:dev    # Timeout checker + rapport hebdo
```

---

## Accéder au dashboard

1. Ouvre **http://localhost:3000/dashboard**
2. Entre la clé API depuis `.env.seed` (générée par le setup)
3. Si `.env.seed` manque, relance : `npm run seed`

---

## Commandes utiles

```bash
npm run build          # Compile TypeScript → dist/ (copie aussi les HTML)
npm test               # 230 tests (Jest)
npm run seed           # Recrée le compte de démo + données

# DB
npm run db:migrate     # Applique les migrations (v1 → v6)

# LLM
npm run llm:pull       # Télécharge le modèle Ollama (qwen3:8b)
npm run llm:list       # Liste les modèles disponibles

# Maintenance
npm run retention:now  # Force le nettoyage des données > 90j

# Docker
docker compose up -d         # Démarre tous les services
docker compose down          # Arrête tout
docker compose restart redis # Redémarre Redis seul
```

---

## Variables d'environnement (.env)

```bash
# Requis
DATABASE_URL=postgres://cronguard:secret@localhost:5432/cronguard
REDIS_URL=redis://localhost:6379
LLM_BASE_URL=http://localhost:11434/v1

# LLM (optionnel — défauts raisonnables)
LLM_MODEL=qwen3:8b
LLM_MAX_TOKENS=500
LLM_TIMEOUT_MS=15000
LLM_RATE_LIMIT_PER_CLIENT=10
LLM_GLOBAL_RATE_LIMIT=30

# App
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Stripe (optionnel — paiements désactivés si absent)
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRO_PRICE_ID=price_...

# Email (optionnel — alertes désactivées si absent)
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=465
# SMTP_USER=resend
# SMTP_PASS=re_...
# SMTP_FROM=alerts@cronguard.io
```

---

## Intégrer un cron job (en 1 ligne)

```bash
# Bash — ajouter à la fin de votre script
curl -sX POST http://localhost:3000/ping/VOTRE_PING_KEY \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"$([ $? -eq 0 ] && echo success || echo fail)\",\"exit_code\":$?,\"output\":\"$LOG\"}"
```

```javascript
// Node.js
const res = await fetch(`http://localhost:3000/ping/${PING_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'success', duration_ms: Date.now() - start, records }),
})
```

---

## Raccourcis clavier dashboard

| Touche | Action           |
|--------|------------------|
| `1`    | Vue Dashboard    |
| `2`    | Services         |
| `3`    | Journal          |
| `4`    | Analyses IA      |
| `5`    | Paramètres       |
| `6`    | Documentation    |
| `/`    | Rechercher       |
| `R`    | Rafraîchir       |
| `Esc`  | Fermer drawer    |

---

## Ports exposés

| Port  | Service    |
|-------|------------|
| 3000  | API + Dashboard |
| 5432  | PostgreSQL |
| 6379  | Redis      |
| 11434 | Ollama LLM |
