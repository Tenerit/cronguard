# Changelog — CronGuard

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [1.4.0] — 2026-06 — Fiabilité, sécurité & coût token

### Ajouté
- **Auto-surveillance Prometheus** (`/metrics`) — un outil de monitoring qui meurt en silence ne sert à rien :
  - `cronguard_worker_heartbeat_age_seconds` (dead-man — alerter si > 600)
  - `cronguard_analysis_queue_depth` (gonfle si le worker d'analyse est mort/stallé)
  - `cronguard_analysis_failures_24h` (pings échoués sans analyse IA produite)
  - `cronguard_notification_failures_total{channel}` (alertes non livrées : SMTP/webhook KO)
- **CI d'intégration réel** : job GitHub Actions avec **vrais** Postgres + Redis (applique les vraies
  migrations, seed, smoke) en plus des tests unitaires mockés ; CI tourne désormais sur `master` et lance jest **et** vitest.
- **Budget de tokens du prompt** (coût LLM) : dédup des lignes d'erreur répétées, cap par ligne,
  plafond total `LLM_LOG_BUDGET`, few-shot `LLM_FEWSHOT_MAX` et runbook `LLM_RUNBOOK_BUDGET` réglables.
- **400 tests** (298 jest + 102 vitest).

### Sécurité
- **Garde anti-SSRF** sur les webhooks sortants : loopback / link-local / métadonnées cloud
  (169.254.169.254) toujours bloqués, vérif sur l'IP résolue (anti DNS-rebinding) ; RFC1918 bloquable
  via `WEBHOOK_BLOCK_PRIVATE` (laissé permissif par défaut pour l'ICP air-gapped).
- **CSP durcie** (était désactivée) : bloque object/base-tag/clickjacking/form cross-origin, Google Fonts allowlistée.
- **CVE dépendances** corrigées (`form-data` high, `nodemailer` moderate) → prod 0 vulnérabilité.
- **`/metrics`** : avertissement au démarrage s'il est exposé sans `METRICS_TOKEN`.

### Corrigé
- **Faux positifs « slowdown » semaine 1** : warm-up — pas d'alerte tant que la baseline ne repose pas
  sur ≥ `SLOW_WARMUP_SAMPLES` (défaut 5) succès. Tue la fatigue d'alerte sur monitor neuf/variable.
- URLs `git clone` de la doc pointées vers le vrai dépôt ; guide Windows (`DEMARRAGE.md`) lié.

---

## [1.3.0] — 2026-06 — Analyse IA enrichie

### Ajouté
- **9 signaux contextuels** envoyés au LLM : série temporelle des durées, catégories des incidents précédents, tendance des records, delta depuis le dernier succès, taux d'auto-résolution, p95 durée, corrélations multi-monitors, patterns temporels, few-shot depuis les analyses validées
- **Nouveaux champs d'analyse** : `checks` (vérifications immédiates), `data_impact` (impact données), `fix_minutes` (estimation résolution), `prevention` (fix long terme), `category` (database/network/timeout/resources/dependency/code), `confidence`
- **Pré-traitement des logs** : extraction des 15 lignes à haute valeur, détection de pattern avant LLM (CONNEXION_REFUSÉE, DEADLOCK, POOL_ÉPUISÉ, TLS...)
- **Feedback utilisateur** 👍/👎 sur chaque analyse — les analyses positives alimentent le few-shot
- **max_tokens** : 350 → 500
- **Cache adaptatif** : TTL 7j si confidence=high, 24h si confidence=low
- **Migration v6** : colonnes `checks`, `data_impact`, `fix_minutes` sur `analyses`
- **Badge SVG** : `GET /badge/:monitorId` — embeddable dans README et docs
- **230 tests** (+47 vs v1.2)
- Tests : ping endpoint, dashboard routes, clients settings, weekly report

### Modifié
- Prompt LLM restructuré avec format visuel `┌─/│/└─` et règles explicites par catégorie
- Dashboard drawer analyses : affiche maintenant catégorie, prévention, checks, data impact, fix_minutes
- Dashboard drawer : lien page de statut publique
- `initDb()` applique automatiquement les migrations au démarrage
- Workers : drain des queues avant démarrage (évite les jobs stale après reseed)
- `shouldAlert()` : catch FK violation (resilience après suppression de monitor)
- Warning Stripe déplacé dans l'API uniquement (était affiché 3× dans les logs)

---

## [1.2.0] — 2026-06 — Dashboard v2 + Mobile

### Ajouté
- **Health score** par monitor : jauge 0-100 basée sur l'historique récent
- **Tendance durée 7j** : `↑ 45% / 7j` dans le drawer
- **Rapport hebdomadaire email** : envoyé chaque lundi à 8h aux clients Pro
- **Édition monitor** inline depuis le drawer (PATCH /monitors/:id)
- **Page Paramètres** : Slack webhook, timezone, plan, trial
- **Page Documentation** intégrée au dashboard avec exemples bash/node/python
- **Indicateur "analyse en cours"** : spinner sur monitor en échec récent
- **Responsive mobile** : hamburger menu, breakpoints 768px et 480px
- **Raccourcis clavier** : R, /, Esc, 1-6
- **Suppression sécurisée** : confirmation en tapant le nom du monitor
- **Toasts** : erreurs API visibles

### Modifié
- Migrations automatiques au démarrage via `initDb()`
- Dashboard `loadAnalyses()` : `ping_output` et `ping_exit_code` viennent directement de l'API (JOIN pings)
- `history` endpoint : inclut `p.output` et `analysis_id`

### Corrigé
- `p.output` manquant dans le SELECT de `/monitors/:id/history` → logs d'erreur vides
- Route `/dashboard` capturée par `requireApiKey` → page HTML non servie
- `dist/api/dashboard.html` manquant après `npm run build`

---

## [1.1.0] — 2026-06 — Analyse multi-signaux

### Ajouté
- **Corrélations multi-monitors** : détecte les défaillances simultanées dans les 30 min
- **Patterns temporels** : détecte les échecs récurrents par heure/jour
- **Few-shot learning** : analyses validées comme exemples
- **Contexte historique 7j** : failCount, successRate, durationTrend, sameErrorBefore
- **Migration v5** : colonnes `category`, `prevention`, `confidence`, `correlated_monitors`, `user_feedback`
- **Webhook Slack** depuis l'UI Paramètres
- **Timezone** configurable dans les paramètres

### Modifié
- `analyzer.ts` : prompt enrichi, output 6 champs au lieu de 3
- PGlite supprimé (mode local sans Docker) — Docker requis

---

## [1.0.0] — 2026-05 — Version initiale

### Fonctionnalités
- Monitoring cron jobs par ping HTTP (`POST /ping/:key`)
- Détection : échec explicite, silence (timeout), output validation (0 records)
- Analyse IA locale avec Qwen 3 8B via Ollama (auto-hébergé, logs privés)
- Dashboard web : monitors, logs, analyses IA, activité en temps réel
- Alertes email + Slack
- Plan Free (3 monitors) / Pro (illimité, 9€/mois) avec Stripe
- Trial Pro 14 jours
- SDK bash, Node.js, Python
- Docker Compose (PostgreSQL + Redis + Ollama)
- Setup Windows/macOS/Linux : `node setup.js` / `.\setup.ps1`
- 183 tests
