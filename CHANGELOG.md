# Changelog — CronGuard

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [Unreleased]

### Sécurité
- **`npm audit fix`** : axios (bypass SSRF `NO_PROXY`, ReDoS, prototype-pollution), body-parser,
  follow-redirects, qs — advisories prod critical + high purgées (axios = client des webhooks sortants).
- **zod `^3` → `^4.6.7`** (GHSA-mrhx-c7xc-m3w5 : DoS par épuisement mémoire à la frontière de validation).
- **nodemailer `9` → `10.3.1`** (GHSA-6vj9-mwq6-2f5v : cache DNS process-global réutilisant le
  `servername` TLS entre transports → fuite de creds SMTP cross-tenant) + `npm audit fix` du reste
  → **0 vulnérabilité en production**.
- **PATCH durci** : zod 4 réinjecte les `.default()` sur `.partial()` ; un PATCH sans champ légitime
  écrasait la ligne (monitors : grace_period/env ; maintenance : label + réactivation silencieuse de la
  fenêtre de maintenance). Les handlers n'écrivent plus que les champs réellement envoyés.

### Ajouté
- **Sortie structurée LLM** (`LLM_JSON_MODE`, défaut `json_object`) — `response_format` sur le chemin
  OpenAI-compatible (Ollama natif, OpenAI, Groq…) : décodage contraint en JSON valide, durcit la garantie
  « 100% parsable » et dé-risque un changement de modèle. `json_schema` contraint en plus les enums
  (category/severity/… → aucune étiquette hors-liste) ; gain non établi (1 seul run), reste opt-in car
  support provider plus étroit.
  `off` pour un provider qui rejette le champ.
- **Red-team injection de prompt** — `npm run eval:redteam` (promptfoo) : envoie des logs piégés à
  `analyzeFailure` et vérifie que le modèle n'exécute jamais les instructions injectées.
- **Éval multi-modèles sans clobber** — un run sur un `LLM_MODEL` non-baseline (ou `--out <path>`)
  écrit `eval/results.<modèle>.json` au lieu d'écraser le `results.json` canonique (qui porte le claim
  public). Corrige le piège qui avait fait écraser les chiffres par un run jetable. Recette documentée.
- **Mineur de templates de logs (façon Drain)** — `src/services/llm/drain.ts`, zéro dépendance,
  ON par défaut (`LLM_TEMPLATE_MINING`, false pour retomber sur le dédup exact). Regroupe les
  VARIANTES d'un même motif (« refused db1 »/« db2 » → `[×2] refused db1 ») là où le dédup exact
  ne collapse que les lignes identiques → moins de tokens envoyés au LLM, et un compteur `×N` qui
  reflète la fréquence réelle (systémique vs isolé) tout en préservant un sample concret. 7 tests.
- **Éval : colonnes tokens** — `eval/run.ts` rapporte `avg_tokens_in`/`avg_tokens_out` (usage réel
  du provider) + latence agrégée et le flag `template_mining`, pour mesurer le gain mining ON vs OFF
  à jeu de cas identique.

### Changé
- **Prompt SYSTEM télégraphique** (2026-11-06) — directive de concision/action : `cause` ≤ 20 mots citant
  la valeur EXACTE du log, `action` impérative exécutable tout de suite, `checks` ≤ 8 mots (le plus décisif
  d'abord), zéro préambule. A/B apparié ancien/nouveau prompt, même session (5 runs, 260 appels) : réponses
  plus courtes (tok_out 162 → 149, tok_in 963 → 1144), latence médiane 15,5 s → 14,6 s, catégorie 76,2 % → 72,3 %
  (écart −3,9 pts, IC95 −10,8 à +2,3 : non significatif), sévérité exacte 50,8 % → 46,9 %. Pas de gain de précision
  établi.

### Corrigé
- **Échec sans log : plus de cause inventée.** Sans log ni `records` hors plage, le modèle n'est plus appelé
  (il répondait par exemple `high/database` sur du vide). L'analyse indique « cause impossible à déterminer », avec
  `category: unknown`, `confidence: low` et `model: none`, y compris si le LLM est indisponible. 5 tests.
- **Analyse des échecs réparée.** Une requête du worker (`AVG` + `ORDER BY`) était rejetée par Postgres : chaque
  échec signalé par un ping plantait le job avant l'analyse et l'alerte. Présent depuis le commit initial.
- **Test de bout en bout en CI** (`npm run test:e2e`) : vrais API, worker, Postgres et Redis, faux LLM. Couvre le
  chemin ping → analyse → alerte, le cache et `sameErrorBefore`.
- **`sameErrorBefore` compare enfin l'erreur.** Il valait vrai dès qu'un monitor avait eu une analyse quelconque
  dans les 7 jours : deux pannes sans rapport comptaient comme récurrentes, ce qui poussait la sévérité à
  « high » au minimum. Il exige maintenant la même empreinte d'erreur, et reste faux sans log. 5 tests.
- **Cache : durées et tailles normalisées dans l'empreinte d'erreur** (`3630s`, `1h30m`, `512MB`). La même panne
  avec une valeur différente ne rappelle plus le modèle. Un zéro reste distinct (`wrote 0 bytes`). 4 tests.
- **Éval : nom de job neutre.** `jobName` entre dans le prompt et contenait le nom de la fixture
  (`oom-killer-137`…), ce qui soufflait la catégorie attendue. Tous les scores antérieurs portent ce biais ;
  son ampleur n'est pas établie. Score actuel (5 runs, llama3.2:3b) : catégorie 76 % ± 7 (runs 65–85), sévérité
  45 % ± 4, 98 % à ±1 rang, 100 % parsable, ~15 s. Ce chiffre passe le seuil de 75 % sans marge.
- **Annonces retirées** : « latence −27 % » et « catégorie 76 % → 86 % » (publiées plus tôt dans cette version).
  Elles comparaient des sessions différentes, alors que la latence varie du simple au double selon la charge
  et la catégorie de plus de 10 pts à code identique.

### Mesuré (2026-11-03, 5 runs, llama3.2:3b, avant correction du nom de job — chiffres historiques)
- **Claim catégorie tient** : 76% ± 7 (runs 69–85), sévérité 57% ± 4, **100% ±1 rang**, **100% parsable**,
  ~20 s/analyse. `eval/results.json` rafraîchi.
- **Mining : gain tokens ≈ 0 sur le jeu labo** (972 ON vs 971 OFF) — les fixtures ont peu de lignes
  répétées. Le levier ne paie que sur de **vrais logs à spam répétitif** ; pas de chiffre labo à vendre.
- **qwen3:4b non concluant** : réponses vides sur les 6 appels observés, test arrêté, avec 512 tokens max.
  Cause non vérifiée ; ne permet pas de conclure sur ce modèle.
- **json_schema mesuré** (1 run, 26 cas) : cat 80,8% · sév 50% · **100% parsable** · tok_in 970. Un seul run : ni gain
  de précision ni coût de latence établis. **Défaut `json_object` conservé** (support provider plus large).

---

## [1.5.0] — 2026-06 — Durcissement (revue multi-expert) & dette data

### Sécurité
- **`/auth/register`** ne renvoie plus la clé API d'un compte existant (fuite corrigée).
- **Secret SSO** comparé en **temps constant** (`crypto.timingSafeEqual`) — anti timing-attack.
- **XSS** : échappement du nom de monitor dans le badge SVG (servi sans auth) + des sorties LLM
  (cause/action) et du nom de job dans les emails ; CSP `default-src 'none'` sur le badge.
- **`/metrics` fermé par défaut** (401) sauf `METRICS_TOKEN` ou `METRICS_PUBLIC=true`.
- **Garde clé Stripe** au démarrage (clé absente / mal formée / standard-live full-access).

### Fiabilité
- **Redis down = fail-loud** : l'enqueue du checker et du ping ne perd plus l'alerte en silence
  (le tick survit, log bruyant) au lieu de crash-looper.
- **Migrations sérialisées** entre les 4 process (`pg_advisory_xact_lock`).
- **DLQ** : jobs d'analyse échoués capturés (Redis) + métrique `cronguard_analysis_dlq_depth` +
  endpoints admin `GET /clients/dlq` / `POST /clients/dlq/replay` (scopés par tenant).
- **Auto-surveillance** : `worker_heartbeat_age_seconds` (dead-man), `analysis_queue_depth`,
  `analysis_failures_24h`, `notification_failures_total{channel}` + règles Prometheus prêtes
  (`docs/cronguard.rules.yml`).
- Garde anti-chevauchement du tick checker ; restart ne purge plus les jobs en attente.

### Ajouté
- **Mémoire d'incidents ON par défaut** (le moat) — dégradation gracieuse si modèle d'embed absent.
- **Page `/pricing`** + plans centralisés (`plans.ts`), analyse IA réservée au plan Pro.
- **Funnel** : README demo-first, ICP explicite, section pricing.
- **Harness d'éval rigoureux** : N runs + moyenne ± écart-type, jeu `--set real` (vrais logs),
  mode `LLM_RAW_LOGS` (isole modèle vs préprocessing regex), verdict vs seuil.
- **CI** : job d'intégration PostgreSQL + Redis **réels** ; build/deploy **gated sur tag**.

### Corrigé / Refacto
- **`diagnosis` cause/action → colonnes typées** (migration v16, backfill) ; le blob JSON reste
  écrit pour le dashboard ; `parseDiagnosis` (5 callsites) supprimé.
- **Cache** : empreinte d'erreur **complète** (fin des collisions de préfixe à 600c) ; la sévérité
  d'un incident **récurrent** n'est plus servie périmée (règle « récurrent → ≥ high » au cache-hit).
- **Coût** : l'embed du recall ne tourne plus sur un futur cache-hit ; clé de cache et `error_hash`
  persisté alignés.
- Modèle setup `qwen3:8b` → `llama3.2:3b` ; rate-limit `/auth` + `/billing` ; email onboarding en EN.
- **307 tests jest + 102 vitest**.

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
