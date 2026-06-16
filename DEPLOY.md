# CronGuard — Guide de déploiement production

## Architecture cible

```
Internet
    ↓
Nginx / Caddy (TLS, rate limiting)
    ↓
CronGuard API  (Fly.io ou VPS)
    ↓         ↓              ↓
Postgres    Redis         Workers
(Neon)   (Upstash)    (analysis + checker)
                           ↓
                       vLLM (GPU Hetzner/Scaleway)
```

---

## Option A — Fly.io (recommandé, le plus simple)

### 1. Prérequis

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Bases de données managées

```bash
# PostgreSQL (Neon — tier gratuit généreux)
# → https://neon.tech → New project → copier DATABASE_URL

# Redis (Upstash — tier gratuit)
# → https://upstash.com → New database → copier REDIS_URL
```

### 3. Premier déploiement

```bash
cd cronguard

# Initialise l'app Fly
fly launch --no-deploy --name cronguard --region cdg

# Configure tous les secrets
fly secrets set \
  DATABASE_URL="postgres://user:pass@host/cronguard" \
  REDIS_URL="redis://default:pass@host:6379" \
  LLM_BASE_URL="http://ton-gpu-server:8000/v1" \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  STRIPE_PRO_PRICE_ID="price_..." \
  SMTP_HOST="smtp.resend.com" \
  SMTP_PORT="465" \
  SMTP_USER="resend" \
  SMTP_PASS="re_..." \
  SMTP_FROM="alerts@cronguard.io" \
  APP_URL="https://cronguard.fly.dev" \
  ALLOWED_ORIGINS="https://cronguard.fly.dev"

# Migration DB
fly ssh console -C "node dist/db/migrate.v2.js"

# Deploy
fly deploy
```

### 4. Workers séparés

```bash
# Worker d'analyse (machine dédiée)
fly machine run . \
  --name worker-analysis \
  --command "node dist/workers/analysis.worker.js" \
  --env NODE_ENV=production

# Timeout checker (machine dédiée)  
fly machine run . \
  --name worker-checker \
  --command "node dist/workers/timeout.checker.js" \
  --env NODE_ENV=production
```

---

## Option B — VPS Hetzner (plus de contrôle, ~15€/mois)

### 1. Serveur recommandé

- **API + Workers** : CPX21 (3 vCPU, 4GB RAM) — ~8€/mois
- **GPU pour vLLM** : GX2-120 (NVIDIA L40S, 48GB VRAM) — ~190€/mois

### 2. Setup initial

```bash
# Sur le VPS
apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx

# Clone le projet
git clone https://github.com/Tenerit/cronguard.git
cd cronguard
cp .env.example .env
nano .env  # remplis les variables
```

### 3. Docker Compose prod

```bash
# Lance tout
docker compose up -d

# Migration
docker compose exec api node dist/db/migrate.v2.js

# TLS avec Let's Encrypt
certbot --nginx -d cronguard.io -d www.cronguard.io

# Active nginx
cp docker/nginx.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
```

### 4. vLLM sur le serveur GPU

```bash
# Sur le serveur GPU (séparé)
docker run --gpus all \
  --network host \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct \
  --quantization awq \
  --max-model-len 4096 \
  --max-num-seqs 16 \
  --port 8000 \
  --host 0.0.0.0

# Dans .env du VPS API :
# LLM_BASE_URL=http://IP_GPU_SERVEUR:8000/v1
# Sécurise avec un firewall : seul le VPS API peut accéder au port 8000
```

---

## Stripe : configurer le webhook

```bash
# 1. Dans le dashboard Stripe → Webhooks → Add endpoint
#    URL : https://tondomaine.io/webhooks/stripe
#    Events : checkout.session.completed, invoice.payment_succeeded,
#             invoice.payment_failed, customer.subscription.deleted,
#             customer.subscription.updated

# 2. Copier le webhook secret → .env STRIPE_WEBHOOK_SECRET

# 3. Tester en local avec Stripe CLI
stripe listen --forward-to localhost:3000/webhooks/stripe
```

---

## Checklist avant mise en prod

```
□ DATABASE_URL configuré et migration exécutée
□ REDIS_URL configuré
□ LLM_BASE_URL accessible depuis les workers
□ Stripe webhook configuré et testé
□ SMTP configuré (tester avec /auth/register)
□ ALLOWED_ORIGINS contient ton domaine prod
□ NODE_ENV=production
□ trust proxy actif (derrière nginx/Caddy)
□ Ollama retiré de docker-compose.yml en prod (vLLM utilisé)
□ Backups Postgres automatiques (Neon le fait, sur VPS : pg_dump cron)
□ Monitoring de l'API elle-même (ironique mais nécessaire 😄)
```

---

## Surveillance post-déploiement

```bash
# Logs en temps réel
fly logs                          # Fly.io
docker compose logs -f api        # VPS

# Santé
curl https://ton-api.io/health

# Files BullMQ (depuis Redis)
redis-cli -u $REDIS_URL
> LLEN bull:ping-processor:waiting
> LLEN bull:llm-analysis:waiting

# Coûts GPU vLLM
curl http://gpu-server:8000/metrics | grep vllm_requests
```
