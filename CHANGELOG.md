# Changelog — CronGuard

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

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
