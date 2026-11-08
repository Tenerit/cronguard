# Changelog — CronGuard

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [Unreleased]

### Sécurité
- Page de statut publique : `GET /status/<id non UUID>` arrêtait le processus API (rejet non géré) — n'importe quel visiteur pouvait le faire tomber en boucle. Renvoie 404.
- CSP stricte pour les scripts : plus aucun handler inline (103 `onclick`/`oninput`/`onchange` remplacés par des attributs `data-click`… et un écouteur délégué), blocs `<script>` autorisés par empreinte SHA-256 calculée au démarrage. `script-src` n'a plus `'unsafe-inline'`.
- Rapport hebdomadaire : nom du job, environnement, cause et action étaient insérés sans échappement dans le mail (injection HTML, ex. lien piégé via un nom de monitor). Échappés.
- Clés API stockées en empreinte SHA-256 (migration v18, les clés existantes restent valides). La récupération de compte par mail émet une **nouvelle** clé et révoque l'ancienne ; accepter une invitation émet une nouvelle clé de membre.
- XSS stockée corrigée dans le dashboard (env, planification, nom de monitor dans les actions, JSON d'édition).
- Clé API acceptée uniquement dans l'en-tête `X-API-Key` (plus `?apiKey=`).
- **`npm audit fix`** : axios (bypass SSRF `NO_PROXY`, ReDoS, prototype-pollution), body-parser,
  follow-redirects, qs — advisories prod critical + high purgées (axios = client des webhooks sortants).
- **zod `^3` → `^4.6.7`** (GHSA-mrhx-c7xc-m3w5 : DoS par épuisement mémoire à la frontière de validation).
- **nodemailer `9` → `10.3.1`** (GHSA-6vj9-mwq6-2f5v : cache DNS process-global réutilisant le
  `servername` TLS entre transports → fuite de creds SMTP cross-tenant) + `npm audit fix` du reste
  → **0 vulnérabilité en production**.
- **PATCH durci** : zod 4 réinjecte les `.default()` sur `.partial()` ; un PATCH sans champ légitime
  écrasait la ligne (monitors : grace_period/env ; maintenance : label + réactivation silencieuse de la
  fenêtre de maintenance). Les handlers n'écrivent plus que les champs réellement envoyés.

### Mesuré — leviers commande et contexte d'exécution (2026-11-08)
- public4 (17 pannes StackExchange collectées AVANT les leviers, commande recopiée quand le message la donne) : **5,0/10 avec les leviers, 4,6 sans** (+0,4, IC −0,4 à +1,2, non significatif). La vérification de commande règle les 2 cas où elle s'applique (2 → 8, 2 → 9). La sonde d'environnement n'est pas mesurable sur des messages publics, qui ne la contiennent pas : il faut de vrais logs SDK.

### Mesuré — note du diagnostic /10 (2026-11-08)
- Notation automatique (`eval/rubric.ts`, `eval/score.ts`), rapport `eval/REPORT.md`. Départ 4,4/10. Fiches connues 25 → 89, dont la cause remplace celle du modèle : +2,7 (IC +2,1 à +3,3). Connaissance cron dans le prompt : +0,1 (non significatif, non adoptée). qwen2.5:7b : −0,2 et 1,7× plus lent (non adopté).
- Note finale 6,8/10 tous jeux confondus, mais **3,5/10 sur public3**, le seul jeu hors échantillon (14 pannes StackExchange collectées après toutes les décisions ; modèle brut 2,0). Pannes couvertes par une fiche 8,7 ; non couvertes 3,1. C'est 3,5 qu'il faut retenir.

### Mesuré — cause profonde (2026-11-08, non adopté)
- A/B apparié pré-enregistré (`eval/ab-root-cause.ts`, 3 runs, même session, ordre alterné) : consigne « cause = le POURQUOI, pas le message recopié » contre la consigne actuelle. Cause profonde (regex du mécanisme, écartée si elle correspond déjà au log ; 9 cas publics) : **0 % dans les deux bras**, le modèle recopie le symptôme quelle que soit la consigne. Catégorie 73,0 → 75,7 % (IC −4,6 à +10, non significatif), identifiants inventés 2,7 → 1,8 %. Critère principal non rempli : prompt inchangé. Le mécanisme vient aujourd'hui des corrections connues (déterministes), pas du modèle. Résultats : `eval/results.ab-root-cause.json`.

### Ajouté
- **Autres plateformes de notification** : Discord, Google Chat, Mattermost / Rocket.Chat, ntfy (push téléphone, auto-hébergeable) et PagerDuty (incident résolu automatiquement au rétablissement), avec les mêmes boutons ✅ / ✏️ quand la plateforme le permet. Une seule colonne JSON `clients.channels` (migration v20) : une plateforme de plus ne demande pas de migration.
- **Alertes Microsoft Teams** (webhook Workflows, carte adaptative : cause, action, ligne décisive) et **retour depuis l'alerte, sans se connecter** : boutons « ✅ Analyse juste » / « ✏️ Corriger » sur Teams, Slack et le mail, vers une page signée pour UNE analyse (HMAC, 30 jours). La correction saisie est resservie si la panne revient. Le lien n'enregistre rien tout seul (les aperçus de liens des messageries l'ouvrent) : seul le bouton de la page le fait. Migration v19 (`clients.teams_webhook`, `app_secrets`). Retours du tableau de bord et des liens passent par le même service.
- **Sens officiel des codes** (`exit-codes.ts`) : code de sortie du shell (126 non exécutable, 127 introuvable, 128+N tué par le signal N : 137 SIGKILL/OOM, 143 SIGTERM…), codes `curl: (N)` et `rsync … (code N)` d'après leurs pages de manuel. Utilisés quand aucune fiche ne correspond ; les codes vagues (1, 2) ne concluent rien.
- **Prévention à l'import** : `cronguard-import.sh` signale les risques de chaque commande (`%` non échappé, mot de passe après `-p `, syntaxe bash sous `sh`…) avant toute panne, via `POST /monitors/lint` (lecture seule, ne recopie jamais la commande).
- **Import des timers systemd** (`cronguard-import.sh --systemd`) : un monitor par timer, et un script à relire qui ajoute à chaque service un drop-in `ExecStopPost=` (`cg_systemd_report` dans le SDK bash) remontant résultat, code de sortie et journal de CETTE exécution (`INVOCATION_ID`). Commande du service intacte. `OnCalendar` courant → cron ; sinon grâce = 1,5 × l'intervalle.
- **15 corrections connues de plus** (25 au total), centrées sur les sauvegardes, ETL et synchronisations : pg_dump plus ancien que le serveur, authentification PostgreSQL/MySQL, droit LOCK TABLES, commande introuvable (PATH du cron), module Python manquant (venv), CA interne non approuvée, certificat sans SAN, identifiants cloud expirés, tas Node.js plein, défi Let's Encrypt injoignable, rsync code 23, tar « file changed as we read it », clé SSH refusée, trop de fichiers ouverts. Regex d'après les messages standard des outils ; aucun nouveau faux positif sur les 26 fixtures maison ni sur des messages voisins testés (404, « not found », jeton OAuth révoqué). Elles couvrent 10 des 11 cas publics, que j'avais vus : cette couverture est dans l'échantillon.
- **Rapport hebdomadaire : valeur mesurée** — pannes résolues par une correction déjà vérifiée (sans appel au modèle) sur le total, et corrections enregistrées dans la semaine. Comptages réels, aucune estimation.
- **Paquet hors ligne** (`scripts/offline-bundle.sh`) : image (~80 Mo) + `install.sh` + `SHA256SUMS`, et avec `--with-model` Ollama + modèle. Testé sans modèle : image locale supprimée puis réinstallée par `install.sh`, `/health` OK. Testé avec `--with-model` le 2026-11-08 : paquet de 5,2 Go (image Ollama 3,2 Go + modèle 1,9 Go), sommes de contrôle OK, image CronGuard supprimée puis rechargée par `install.sh`, modèle présent dans Ollama sans téléchargement, vraie analyse via `/monitors/analyze/preview` (`model: llama3.2:3b`). Corrigé au passage : un dossier de sortie en chemin absolu cassait l'extraction du modèle, après le téléchargement de 2 Go.
- **Image tout-en-un** (`Dockerfile.allinone`, ~350 Mo) : PostgreSQL 16, Redis, API et workers dans un seul conteneur, IA optionnelle. `docker run -v cronguard-data:/data` et c'est prêt. PostgreSQL/Redis n'écoutent que sur 127.0.0.1 ; arrêt propre sur SIGTERM ; si un processus meurt, le conteneur s'arrête et Docker le relance. Sauvegarde PostgreSQL au démarrage puis toutes les 24 h dans `/data/backups` (format custom, 7 jours, réglable). Testé par `scripts/test-allinone.sh`, y compris une restauration réelle.
- **Mesure hors échantillon** : `eval/public-cases.ts`, 11 vraies pannes publiques sourcées (issues, forums), étiquettes figées avant le passage du modèle. 3 runs (2026-11-07) : catégorie 72,7 % (réponse constante 36 %), cause 78,8 %, action 75,8 %, 0 % d'identifiants inventés, lignes de log liées 90,9 % (30/33), 0 pack déclenché à tort sur 11. Sans modèle : catégorie 0/11 (toujours « unknown »), cause contenant le fait 8/11. Limites : 11 cas, logs souvent explicites, le modèle reformule surtout le symptôme sans trouver la cause profonde établie dans le fil ; sévérité non étiquetée donc non mesurée.
- **Corrections connues (packs)** livrées d'office pour 10 pannes courantes (WAL PostgreSQL plein, inodes, disque plein, OOM 137, PostgreSQL injoignable ou saturé, deadlock, DNS, certificat expiré, 429) : déclenchées par le texte des logs, présentées « à adapter », masquées quand une correction vérifiée existe. Sur les 26 fixtures : chaque pack se déclenche sur sa panne et sur aucune autre (regex écrites en voyant ces logs : précision dans l'échantillon).
- **Lignes de log liées** à chaque analyse (dashboard, mail, Slack, webhook `evidence`) : choisies par le code, recopiées des logs nettoyés, jamais générées par le modèle. Mesuré hors ligne sur les 130 réponses réelles du 2026-11-07 : la ligne retenue contient le fait attendu dans 96,2 % des cas (base « dernière ligne d'erreur » : 61,5 %). Chiffre **dans l'échantillon** : le vocabulaire FR/EN a été réglé sur ces mêmes fixtures (72,3 % avant), aucune mesure hors échantillon faute de vrais logs.
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

### Ajouté
- **Mémoire panne × cause × correction.** Bouton « Ce qui a réglé la panne » sur chaque analyse (`POST /monitors/analyses/:id/fix`,
  migration v17). Si la même panne revient sur ce job, la correction confirmée est resservie par le code, datée, sans appel
  au modèle. Pour une panne similaire, elle remplace l'action du modèle dans les exemples du prompt. Un 👎 l'annule. Les
  secrets collés par erreur sont retirés. Les webhooks reçoivent `action_verified`. Couvert par le test e2e.

### Corrigé
- **Démo : vraies sorties du modèle.** Les réponses de la démo en ligne, du seed Docker et de l'exemple vide étaient
  écrites à la main et meilleures que le produit. Elles viennent maintenant de `llama3.2:3b` sur les mêmes logs, en un
  seul passage, sans tri. Le playground statique indique qu'il montre un exemple enregistré et n'analyse pas vos logs.
- **Action présentée comme une piste** : « Piste à vérifier » dans les alertes, le rapport hebdo et le dashboard. Le champ
  `action` des webhooks ne change pas. L'exemple du README, écrit à la main, est remplacé par une vraie sortie du modèle.
- **`eval/results.json` régénéré** : catégorie 72 % ± 4 (sous le seuil de 75 %), cause 88 %, action 58 %, 1,5 % d'identifiants
  absents des logs, sévérité 57 %. Deux sessions à 72 % contre 76-78 % avant : la perte sur la catégorie semble réelle.
- **Prompt : le modèle n'invente plus de paramètres ni de récurrence.** Il recopiait nos exemples
  (`max_standby_streaming_delay` sur un `ECONNRESET`) et affirmait « récurrent » sans historique. Exemples retirés,
  récurrence signalée seulement si elle est réelle, sévérité relevée par le code. Faux positifs corrigés dans la
  détection de motifs (quota d'API pris pour un disque plein). A/B apparié (5 runs, 260 appels) : identifiants absents
  des logs 58 % → 1,5 %, récurrence mentionnée dans la cause 35 % → 0 %, cause 75 % → 88 %, sévérité exacte 39 % → 58 %, catégorie
  76 % → 72 % (IC95 −17 à +9), action 68 % → 58 % (IC95 −30 à +11). Une perte sur la catégorie ou l'action n'est pas
  exclue. Le critère fixé avant la mesure n'était pas rempli ; publié par décision explicite.
- **Éval : mesure de la cause et de l'action**, plus seulement de l'étiquette (`eval/quality.ts`). Mesuré sur 5 runs :
  cause 88 %, action 71 % (filtre lâche par mots-clés), 53 % des réponses citent un identifiant absent des logs,
  catégorie 78 % ± 3 (constante : 15 %), sévérité exacte 41 % (constante `high` : 46 %).
- **Redémarrage** : Postgres et Redis repartent seuls dans `docker-compose.yml`. Après un reboot de Docker, ils
  restaient arrêtés et l'API bouclait sur `ENOTFOUND postgres`.
- **SDK** : l'adresse par défaut est `http://localhost:3000`, plus `https://api.cronguard.io`. Une variable
  oubliée aurait envoyé les logs hors de la machine.
- **Auto-hébergé sans Stripe** : plus de limite à 3 monitors.
- **Observateur Windows** (`scripts/windows-observer.ps1`) : suit des tâches planifiées sans les modifier.
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
