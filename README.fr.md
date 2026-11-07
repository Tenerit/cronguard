# CronGuard

Monitoring intelligent de cron jobs avec analyse IA self-hosted.
Un job plante ? Tu sais pourquoi en 2 secondes, sans regarder un seul log.

🇬🇧 [English version](README.md)

---

## Démarrage en 3 minutes

```bash
git clone https://github.com/Tenerit/cronguard
cd cronguard
./setup.sh        # installe, configure, migre, télécharge le modèle LLM
make dev          # lance l'API + workers
make seed         # crée un compte démo avec des données
make open         # ouvre le dashboard
```

C'est tout. Le setup détecte ton environnement et configure tout automatiquement.
Sans `bash` (Windows) → `node setup.js` ou `.\setup.ps1` ; détails dans [DEMARRAGE.md](DEMARRAGE.md).

---

## Intégration dans ton script

### Importer une crontab existante
Crée un monitor par job et affiche la crontab avec chaque commande enveloppée par `cg_run`. Ta crontab n'est jamais modifiée : tu relis puis tu recolles.
```bash
sudo cp sdk/bash/cronguard.sh /usr/local/lib/cronguard.sh
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh            # aperçu
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --apply    # crée les monitors
```
Pour `/etc/crontab` ou `/etc/cron.d/*` (colonne utilisateur en plus) : passer le fichier et `--system`. Les timers systemd ne sont pas importés.

### Bash (le plus simple)
```bash
source sdk/bash/cronguard.sh
cg_run "ta-ping-key" /scripts/mon-script.sh
```

### Node.js
```javascript
import { monitor } from './sdk/node/cronguard'

await monitor('ta-ping-key', async () => {
  const count = await syncDatabase()
  return { records: count }
})
```

### Python
```python
from sdk.python.cronguard import monitor

@monitor('ta-ping-key')
def my_job():
    count = sync_database()
    return {'records': count}
```

### cURL direct
```bash
# Payload complet (JSON)
curl -X POST http://localhost:3000/ping/ta-ping-key \
  -d '{"status":"success","duration_ms":1200,"records":5000}'

# Variante bash, une ligne, sans JSON (style Healthchecks)
curl http://localhost:3000/ping/ta-ping-key/$?      # exit code : 0 = success, sinon fail
curl http://localhost:3000/ping/ta-ping-key/fail    # échec explicite
curl "http://localhost:3000/ping/ta-ping-key/success?duration_ms=1200"

# Détection des jobs bloqués : ping /start au début, complétion à la fin
curl http://localhost:3000/ping/ta-ping-key/start   # job démarré
./mon-script.sh
curl http://localhost:3000/ping/ta-ping-key/$?      # terminé — si absent trop longtemps → alerte "hung"
```

---

## Notifications

Une alerte est envoyée sur **tous** les canaux configurés, puis une notification de
**rétablissement** ("✅ résolu") quand le job repasse au vert.

| Canal | Configuration |
|-------|---------------|
| Email | variables `SMTP_*` |
| Slack | webhook entrant — Paramètres › Notifications |
| Webhook générique | URL custom (Discord, Teams, PagerDuty, n8n…) — reçoit le JSON d'alerte/rétablissement |

---

## Observabilité

```bash
curl http://localhost:3000/metrics    # format Prometheus (monitors, alertes, pings 24h…)
```

Protégeable via `METRICS_TOKEN` (`Authorization: Bearer <token>` ou `?token=`).

---

## Modèle LLM

Par défaut **llama3.2:3b** via Ollama local (gratuit, privé, pas de raisonnement → rapide).

Pour une qualité supérieure, pointez vers n'importe quel endpoint **OpenAI-compatible** —
définir `LLM_API_KEY` active l'auth et bascule en mode cloud :

```bash
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1   LLM_MODEL=gpt-4o-mini        LLM_API_KEY=sk-...
# OpenRouter (Claude, etc.)
LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=anthropic/claude-3.5-haiku LLM_API_KEY=sk-or-...
# Groq (Llama 70B, très rapide)
LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_MODEL=llama-3.3-70b-versatile  LLM_API_KEY=gsk_...
```

Le pipeline de contexte (historique 7j, corrélations, patterns, few-shot) reste identique —
seul le modèle change.

---

## Commandes utiles

```bash
make help          # liste toutes les commandes
make dev           # développement (hot reload)
make test          # lance les 230 tests
make ping-test     # envoie un ping de test
make api-test      # vérifie que l'API répond correctement
make queue-status  # état des queues BullMQ
make db-shell      # shell PostgreSQL interactif
make deploy-check  # checklist avant mise en prod
make deploy-fly    # déploie sur Fly.io
```

---

## Architecture

```
Client script
    ↓ POST /ping/:key
API (Express)
    ↓ Queue (BullMQ + Redis)
Workers
    ├── Ping processor     → stocke en DB, détecte output invalide, notif rétablissement
    ├── Analysis worker    → appelle le LLM, envoie les alertes (email/Slack/webhook)
    └── Timeout checker    → jobs silencieux (cron-aware) + bloqués (hung) + lents · 60s
                                       ↓
                               Ollama (llama3.2:3b — instruct, pas de raisonnement)
                               réseau interne uniquement
```

**Protections actives :**
- Rate limiting par client (10 analyses/heure) + global (30/minute)
- Circuit breaker Redis (coupe le LLM après 5 erreurs)
- Deduplication des alertes (cooldown 30min, acknowledge, snooze)
- Sanitisation des logs (9 patterns : JWT, API keys, URLs avec creds...)
- Anti prompt-injection (logs isolés en XML dans le prompt)
- SQL injection (whitelist de colonnes sur PATCH)

---

## Déploiement prod

Voir [DEPLOY.md](DEPLOY.md) pour les guides complets Fly.io et VPS Hetzner.

```bash
make deploy-check  # vérifie que tout est prêt
make deploy-fly    # déploie
```

---

## Contribuer

Les contributions sont bienvenues — voir [CONTRIBUTING.md](CONTRIBUTING.md) pour
le setup, les tests et l'architecture. En résumé : `npm test` + `npx vitest run`
+ `npx tsc --noEmit` doivent être verts avant toute PR.

## Licence

[MIT](LICENSE) — utilisez, modifiez, hébergez librement.

---

## Développé avec

Node.js · TypeScript · Express · BullMQ · PostgreSQL · Redis · Ollama (llama3.2:3b) · Stripe · Docker
