# Changelog — CronGuard

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

---

## [Unreleased]

### Mesuré — l'IA nomme les jobs à l'import de la crontab : non adopté (2026-11-11, attentes fixées avant)
- 84 lignes de crontab réelles (questions publiques), critique marqué à la main avant le run (`eval/job-names.ts`).
- Remplies : acceptés par les garde-fous **100 %**, drapeau critique d'accord **82 %**, nom plus clair que celui du code pour **~70/84** (le code donne « root », « python3 », « time »…). **Non remplies : nom + description justes 62/84 = 74 % (attente ≥ 85 %), 7,1 s par job (attente ≤ 5).** 12 des 22 erreurs décrivent mal le planning (« hebdomadaire » pour lundi-vendredi, « minuit » pour 22 h), que le code connaît déjà ; les autres inventent (« base de données » pour un backup.sh). Le reverse shell du jeu est nommé et décrit comme malveillant.
- Rectificatif : le « root » pris pour nom de job venait de la simulation de la mesure, pas de l'import, qui gère la colonne utilisateur des crontabs système avec `--system`.

### Mesuré — l'IA repère les secrets que les règles ratent : non adopté (2026-11-11, attentes fixées avant)
- 19 journaux avec un secret dans un format que le masquage rate (valeurs générées à l'exécution), 30 vrais journaux sans secret (`eval/secrets.ts`).
- IA : rappel **84 %** (≥ 80 %), journaux propres masqués à tort **7 %** (≤ 15 %), **4,7 s** : remplies. Règle de code fixée avant : rappel 89 % mais **43 %** de journaux propres masqués à tort. **Critère d'écart IA − code ≥ 15 points non rempli (−5).** Ni l'IA (règle fixée avant) ni la règle de code (43 % de faux, elle masquerait versions et piles d'appels) ne sont livrées. Défaut de la pré-inscription : les faux de la règle de code n'étaient pas bornés. Détail : `eval/archive/SECRETS.md`, `eval/archive/JOB-NAMES.md`.

### Mesuré — l'IA pose des questions pour guider l'enquête : échec, non branché (2026-11-11, attentes fixées avant)
- Quand la cause n'est pas établie, le 7B pose 2-3 questions ; le code n'accepte que celles qui finissent par « ? », citent un élément réel des faits, n'inventent rien et n'affirment pas de cause (`eval/questions.ts`, 37 pannes sans cause établie).
- Remplies : au moins une question acceptée **97 %**, sorties sans identifiant inventé **99 %**, **8,3 s**. **Non remplies : une question pointe la vraie cause ou la bonne vérification dans 19 % des cas (attente ≥ 30 %) ; relecture humaine, ~5 utiles sur 20 (attente ≥ 70 %).** Les questions sont génériques (« Quel est le chemin du fichier où se trouve cette erreur ? »). Défaut du garde-fou trouvé : les en-têtes des faits (« Commande ») servaient d'ancre, ce qui gonfle le 97 %.
- **Non branché.** Détail : `eval/archive/QUESTIONS.md`.

### Mesuré — « déjà vu ? » : retrouver une réparation passée par ressemblance : échec, non affiché (2026-11-11, attentes fixées avant)
- Embeddings locaux (`nomic-embed-text`, ~274 Mo). Mémoire simulée : 160 pannes StackExchange, la réponse acceptée jouant la correction de l'équipe ; 124 pannes étiquetées en requêtes (`eval/recall.ts`).
- Au seuil d'affichage fixé avant (cos ≥ 0,80) : couverture **10 %** (attente ≥ 10 %), précision **46 %** contre 21 % au hasard (2,2 × : attente ≥ 2 × remplie) mais **attente ≥ 60 % non remplie** : 7 corrections sur 13 montrées ne s'appliquent pas. Relecture : 2 ou 3 de ces 7 sont peut-être des sévérités de la grille (installer cronie, `DISPLAY`) ; même en les comptant justes, on reste à la limite. Seuils 0,6 / 0,7 / 0,9 : 35 / 47 / 67 % pour 90 / 41 / 2 % de couverture.
- **Non affiché.** Le partage existant par signature exacte (même ligne d'erreur sur un autre job) reste le seul rappel montré. Limite de la mesure : un corpus public n'est pas l'historique d'une équipe, où la même panne revient sur le même environnement ; seul un pilote dira si le rappel y est plus juste. Détail : `eval/archive/RECALL.md`.

### Ajouté — compte rendu d'incident à envoyer soi-même (2026-11-11)
- Sur chaque analyse : **« ✉ Préparer le compte rendu »** ouvre un brouillon dans la messagerie de l'utilisateur (objet, job, heures d'échec et de rétablissement, cause constatée, lignes de log, réparation constatée, correction, lien) ; il le relit, le complète (« Ce qui a été fait ») et l'envoie lui-même. **« ⧉ Copier le texte »** pour un ticket, un wiki ou Slack.
- **CronGuard n'envoie rien** : pas de SMTP requis, destinataires choisis par l'utilisateur, textes déjà masqués côté serveur, aucune réécriture par l'IA (mesurée à 20 % de sens déformé). L'explication de l'IA, si présente, garde sa mention.
- Lien `mailto:` jusqu'à ~1 800 caractères ; au-delà, brouillon `.eml` (UTF-8, `X-Unsent: 1`) téléchargé, qu'Outlook ou Thunderbird ouvrent comme brouillon modifiable. Encodage vérifié dans le navigateur. Rangée de boutons qui passe à la ligne sur téléphone.

### Ajouté — résolution constatée dans le dashboard (2026-11-11)
- Le contexte relevé par le SDK à l'échec est gardé avec le ping (migration v25 : `pings.context`, `pings.command`, `analyses.resolution`). À la première réussite qui suit, le worker compare les deux relevés et range la différence sur l'analyse de l'échec.
- Dans l'analyse : « Réparation constatée entre l'échec et la réussite » avec chaque changement (avant → après) et le bouton **« ✓ C'est bien la correction »**, qui l'enregistre comme correction de l'équipe : resservie si la panne revient, et transformable en fiche d'équipe. Sans différence relevée, le dashboard le dit (réparation hors du champ des vérifications) et invite à noter ce qui a été fait.
- Testé de bout en bout (vrai PostgreSQL, worker) : PATH fourni à la réussite constaté et renvoyé au dashboard. Exemple réel ajouté à la démo.

### Mesuré — résolution constatée : la réparation se voit-elle ? (2026-11-11, attentes fixées avant)
- Le SDK (bash et Python) relance ses vérifications à la **première réussite après un échec**, sur les mêmes lignes d'erreur, et `contextDiff` compare les deux relevés : variable désormais fournie, dossier devenu modifiable, commande modifiée, fichier apparu. Rien n'est deviné ; une réparation hors du champ des vérifications n'affiche rien.
- Labo cron réel (`eval/resolution-lab.ts`), 11 pannes puis la réparation qu'un ops ferait. **Résultat fixé avant : 7/11 cas justes (attente ≥ 7, remplie), 8 changements parasites (attente ≤ 1, NON remplie).**
- Deux défauts trouvés et corrigés après coup : (1) les réparations de droits (`chown`) étaient invisibles, car à la réussite le fichier existait et son dossier n'était plus relevé ; le dossier parent est maintenant relevé aussi pour un chemin refusé (3 SDK) ; (2) un fichier apparu affichait aussi propriétaire et droits « — → … », redondants. **Après correction : 11/11, 0 parasite** — sur les mêmes scénarios, donc pas une confirmation indépendante. Le labo de diagnostic reste à 11/11.
- Limites : scénarios écrits par nous, une seule cause et une seule réparation chacun ; un vrai serveur change aussi pour d'autres raisons entre deux exécutions (mises à jour, autre job). Le SDK Node ne relève pas encore la réussite.

### Mesuré — l'IA réécrit le compte rendu de correction de l'équipe : échec, non branché (2026-11-11, attentes fixées avant)
- Idée : reformuler la correction écrite par l'équipe (✏️) pour la rendre lisible par tous, sans rien ajouter. 60 réponses acceptées du corpus StackExchange servent de comptes rendus (`eval/rewrite.ts`).
- Critères automatiques remplis : réécritures acceptées par les garde-fous **70 %** (attente ≥ 70 %), sorties sans identifiant inventé **98 %** (≥ 95 %), **30 mots** en médiane contre 46 à l'origine, 13 s.
- **Relecture humaine : sens déformé dans 4 réécritures sur 20 (20 %), pour une attente ≤ 10 %.** Exemples : un « suid obligatoire » devenu « suid pas nécessaire », un exemple `date +\%m\%d\%y` qui perd ses barres obliques et montre exactement l'erreur à éviter, une solution de contournement devenue étape obligatoire. Les garde-fous du code vérifient les identifiants, pas le sens : une négation inversée leur échappe.
- **Non branché.** La correction de l'équipe reste affichée telle qu'elle a été écrite. Détail : `eval/archive/REWRITE.trial1.md`.

### Mesuré — public7, test hors échantillon (2026-11-11, 12 cas, attentes fixées avant)
- **Fiches** : ratés **5 sur 7 couvertes (71 %)** pour une attente ≤ 20 %, note des pannes couvertes **5,0** pour une attente ≥ 7 : **attentes non remplies**. Le travail de précision du 10/11 (ratés 15 → 5 sur les jeux lus) **ne se généralise pas** : les fiches génériques répondent encore sur un symptôme en aval (« verrou » pour un job Quartz déjà enregistré, « service arrêté » pour un postfix mal configuré, « PATH de cron » pour `crontab` absent de l'image Docker).
- **Note globale** (comportement par défaut, sans modèle) : **3,5/10**, puis **3,8** après correction de l'extraction de ligne ci-dessous (preuve 58 → 83 %).
- **Explication de l'IA** : couverture 71 %, rien d'inventé 100 %, 18,3 s ; mécanisme gardé non mesurable (1 cas). Limite constatée : l'explication est fidèle à la fiche **même quand la fiche se trompe**, et peut transformer un exemple de la fiche en affirmation (« l'outil se trouve dans /usr/local/bin »).

### Corrigé — ligne d'erreur non retenue (2026-11-11)
- `No such file`, `not found`, `bad interpreter` n'étaient pas reconnus comme lignes d'erreur : aucune ligne n'était retenue (« aucune ligne d'erreur reconnue »), ce qui privait l'abstention, la signature de la panne et le brouillon de fiche d'équipe. Repli sur la dernière ligne du log si rien n'est reconnu.

### Mesuré — ce qui ne l'était pas (2026-11-11, attentes fixées avant chaque mesure)
- **Grâce apprise** (`eval/grace-sim.ts`, simulation avec les vraies `isLate`/`graceMs`, jobs horaires, grâce réglée 5 min) : fausses alertes « en retard » **−98 % à −100 %** sur les jobs plus longs que leur grâce (154 → 3, 200 → 0, 158 → 0), aucun changement sur les jobs courts ; retard de détection d'une vraie absence ≤ 1,2 × p95. Attentes remplies. **Défaut trouvé et corrigé** : la grâce apprise pouvait dépasser l'intervalle du cron (61,6 min pour un job horaire très variable) ; elle est maintenant plafonnée à l'intervalle (la grâce réglée à la main n'est jamais réduite).
- **Partage des corrections entre jobs** (`eval/shared-fix-risk.ts`) : signatures communes à des pannes différentes, 5,4 % des 112 cas étiquetés et 8,1 % du corpus — **attente ≤ 5 % non remplie** en brut. Relecture des cas étiquetés : 1 paire sur 3 a la même cause (`bundle: command not found`, partage utile), 2 non (`SyntaxError: invalid syntax`, `timeout during connect` de certbot) : faux partage réel 4/112 (3,6 %). Gardé en confiance moyenne avec le job d'origine nommé ; pas mis en avant. Le bénéfice ne se mesure qu'avec de vraies équipes.
- **SDK Python sous un vrai cron** (labo, décorateur `@monitor`) : variable absente, chemin relatif, droits du dossier — **3/3**. Labo complet : **11/11 avec les commandes de test, 3/11 sans**.

### Retiré — réglages d'expériences terminées, rangement de `eval/` (2026-11-11)
- Plus d'interrupteurs d'A/B pour des leviers adoptés ou abandonnés : `LLM_KNOWLEDGE`, `LLM_CONTEXT`, `LLM_CODES`, `LLM_HONEST`, `LLM_KNOWLEDGE_FIRST` (adoptés, toujours actifs), `LLM_INPUT_FIX`, `LLM_CRON_HINTS` (essais clos), `LLM_RAW_LOGS`, `LLM_TEMPLATE_MINING` (modes d'éval). Leurs résultats restent dans le CHANGELOG et `eval/archive/`.
- Indice « Pattern détecté » retiré du prompt de l'ancienne analyse libre (`LLM_DEDUCTION=on`) : il était recopié comme cause dans 29 fausses causes sur 73 (`eval/error-analysis.ts`).
- `eval/` : les rapports datés de chaque essai passent dans `eval/archive/` (journaux dans `eval/archive/logs/`, non suivis) ; `eval/REPORT.md`, `report.json` et `EXPLAIN.md` gardent le dernier résultat (EXPLAIN = essai 4b adopté). `eval/run-phase.sh` supprimé.

### Ajouté — fin de la boucle d'apprentissage : fiches d'équipe (2026-11-11)
- Une panne non reconnue, corrigée par l'équipe (✏️), devient une **fiche d'équipe** active sur tous les jobs du client : Paramètres › Apprentissage (admins), brouillon pré-rempli depuis la ligne d'erreur (sans horodatage ni PID) et la correction réelle, rien d'inventé.
- Déclencheur **littéral** (jamais une regex fournie par l'utilisateur : pas de ReDoS), refusé s'il n'apparaît pas dans les logs de la panne d'origine ; création et désactivation tracées dans l'audit ; cause et action passées au masquage des secrets. Migration v24 (`team_fixes`).
- Ordre d'analyse : correction validée sur ce job → **fiche d'équipe** → correction d'un autre job → faits, fiches, codes. Une panne servie par une fiche d'équipe est « reconnue » et sort des candidates. Nouvelle fiche visible par le worker à la panne suivante (version dans Redis), pas après un délai de cache.
- Testé de bout en bout sur un vrai PostgreSQL : brouillon, refus d'un déclencheur absent des logs, refus pour un autre client, panne d'un autre job servie par la fiche sans modèle, sortie des candidates, désactivation.

## [1.6.0] — 2026-11-11 — Diagnostic constaté, IA d'explication vérifiée

### Changé — installation légère par défaut (2026-11-11)
- `docker-compose.yml` : Ollama passe dans le profil `ai` ; `LLM_BASE_URL` des services est vide par défaut (`CRONGUARD_AI_URL` pour l'IA). `setup.sh` ne démarre Ollama et ne télécharge de modèle (explication + embeddings) que si `LLM_EXPLAIN_MODEL` est défini ; le 3B n'est plus téléchargé. Bundle hors ligne : modèle d'explication par défaut.
- **Playground diagnostic** (ex-« Playground IA ») : même chemin qu'une vraie panne (faits d'abord, explication si activée). Il exigeait le modèle 3B et renvoyait 503 s'il manquait. Pastilles à jour (les anciens chiffres « 72 % catégorie, ~15 s » ne correspondaient plus à rien) ; démo OOM sans l'ancienne sortie « mémoire insuffisante ».
- `/health` annonce le modèle d'explication (ou `none`), plus l'ancien `LLM_MODEL`.

### Sécurité
- **Secrets masqués dès l'entrée** : la sortie des jobs et leur commande sont nettoyées par la route `/ping` avant la file Redis, la base, la file des échecs et les alertes (auparavant, la sortie brute était stockée en base). Nouveaux motifs : mot de passe collé à `-p` (mysql, mysqldump), guillemets compris, et `sshpass -p`. Migration v21 : masquage, une seule fois, des sorties déjà stockées.
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

### Ajouté / corrigé — SDK Node et chemins non cités (2026-11-10)
- **SDK Node** : mêmes commandes de test que bash et Python (shell de connexion : PATH, commandes trouvées, NOMS des variables ; chemins cités par l'erreur et leur dossier parent). Testé sous Windows en unitaire ; le test Linux en conteneur reste à faire (Docker arrêté).
- **Bug corrigé dans les 3 SDK** : un chemin non cité (format GNU, `cat: data/input.csv: No such file…`) était extrait comme `/input.csv`, d'où un faux constat « /input.csv n'existe pas ». Le labo ne le voyait pas : busybox met des guillemets.
- **Grille de notation** : la commande de reproduction construite par le code n'est plus comptée comme « inventée » (biais vu sur public6), corrigé avant public7.

### Mesuré — rôle de l'IA n°1 « expliquer en langage simple » (2026-11-10, attentes fixées d'avance, NON adopté)
- 80 cas où la cause est établie. Rien d'inventé : **98 %** (≥ 95 % ✅) · mécanisme gardé : **76 %** (≥ 90 % ❌) · 41 mots en médiane, mais jusqu'à 4 phrases (≤ 3 ❌) · 7,1 s (≤ 8 s ✅).
- **qwen2.5:7b-instruct** (déjà installé, mêmes 80 cas, mêmes attentes) : rien d'inventé **99 %** ✅ · mécanisme gardé **87 %** (❌ de peu, 76 % pour le 3B) · 37 mots mais jusqu'à 4 phrases ❌ · **14,2 s** ❌. Nettement plus fidèle (« inodes » gardé) ; reste le même défaut : quand la cause liste des alternatives, il n'en garde qu'une (proxy absent sous cron perdu). Non adopté en l'état ; exemples dans `eval/archive/EXPLAIN.qwen7b.md`.
- **Essai 3** (qwen2.5:7b, causes certaines seulement, 3 phrases coupées par le code ; attentes fixées avant) : rien d'inventé **96 %** ✅ · mécanisme gardé **96 %** ✅ · 32 mots, 3 phrases ✅ · **12,9 s** ✅ (≤ 20 s, après l'alerte) · couverture **35 %** des causes établies ❌ (≥ 50 %). Qualité au niveau attendu là où il s'applique ; mais seules 28 causes établies sur 80 ont un seul mécanisme. Le seul « inventé » est un faux positif du garde-fou (« /usr/local/bin. » : le point final n'est pas retiré). Exemples : `eval/archive/EXPLAIN.trial3.md`.
- **Essai 4** (qwen2.5:7b, causes à plusieurs possibilités expliquées, garde-fou « toutes gardées ») : couverture **80 %** ✅ · rien d'inventé **100 %** ✅ · mécanisme gardé **93 %** ✅ · 3 phrases ✅ · **15,8 s** ✅. Toutes les attentes chiffrées remplies, MAIS la relecture trouve : (1) un bug du découpage en phrases (le point de « dump.rdb » coupait le texte : 7 textes cassés sur 64), corrigé ; (2) des déformations de sens que le garde-fou par mots-clés laisse passer (« proxy absent sous cron » → « refusé par un proxy configuré ») et des conseils ajoutés. Relance 4b avec le découpage corrigé + relecture humaine de toutes les explications acceptées.
- Le modèle déforme en simplifiant : « plus d'inodes alors qu'il reste de l'espace » devient « système de fichiers plein » ; quand la cause liste des alternatives (« … ou proxy absent sous cron »), il en garde une et jette les autres — il recommence à deviner. Pas branché ; exemples dans `eval/archive/EXPLAIN.llama3b.md`.

### Amélioré — précision des fiches (2026-11-10, réglé sur les jeux déjà lus ; vérification prévue sur public7)
- Ratés (fiche qui répond à côté) : **15 → 5** sur lab + public à public6. Cause juste quand une fiche répond : public2 86 → 100 %, public3 75 → 88 %, public4 92 → 100 %, public5 71 → 86 %, public6 25 → 88 %.
- **Signaux décisifs qui masquaient une fiche générique** (3 fiches en tête de liste) : continuation de ligne cassée (≥ 2 lignes `--option: command not found`, fins de ligne Windows) au lieu d'« identifiants refusés » ; mot de passe MySQL jamais transmis (`Enter password:` + `using password: NO`) ; serveur X qui refuse la connexion (`No protocol specified`) au lieu de « pas d'affichage ». Une seule ligne d'option orpheline ne suffit pas (variable vide, vérifié sur le corpus).
- **Fiches génériques** (droits, 503, délai réseau, module Python, clé SSH, identifiants PostgreSQL/MySQL, socket MySQL) : la cause liste les vraies alternatives (umask, rotation de logs, utilisateur root, proxy absent sous cron, caractères spéciaux du mot de passe, disque plein) au lieu d'en affirmer une ; confiance moyenne.
- **Masquage des secrets trop large** : `(using password: NO)` (booléen MySQL) et le prompt `Enter password:` étaient masqués, ce qui cachait le diagnostic « mot de passe non transmis ». Les vraies valeurs restent masquées (test ajouté, e2e vert).
- Limite : réglé sur des jeux lus ; la mesure honnête sera public7 (requêtes figées, collecte demain : quota StackExchange atteint).

### Mesuré — public6, test hors échantillon (2026-11-10, 15 cas, 2 runs, A/B `LLM_DEDUCTION=on`)
- Note avec la grille fixée d'avance : **3,9 sans déduction (défaut) contre 4,2 avec le modèle** (écart 0,4, IC95 −0,1 à +0,8, non significatif). Biais vu APRÈS le run : la grille compte comme « inventés » les chemins de la commande de reproduction (`/bin/sh`, `/usr/bin`, la commande du job), absents du log : −1 sur 7 cas. Sans ce biais : environ 4,4 contre 4,2.
- **Causes fausses affirmées : 12 contre 20 sur 30** : retirer la déduction supprime les causes inventées par le modèle, sans perte de cause juste (20 % de mécanismes justes dans les deux bras).
- **Les fiches tiennent mal hors échantillon** : pannes couvertes 5,0 sur public6 contre 9,2 sur les jeux de réglage. Fiches qui répondent à côté : identifiants PostgreSQL sur un script aux fins de ligne Windows, droits génériques au lieu d'umask/logrotate, « service indisponible » sur une page qui exige une connexion, interpréteur Python sur un job lancé par root, serveur MySQL arrêté sur un disque plein absent du log. Prochain chantier : la précision des fiches.

### Mesuré — labo de pannes cron réelles (2026-11-10, `npx tsx eval/cron-lab.ts`)
- Vrai `crond` (Alpine), utilisateur avec son `~/.profile`, SDK bash, 8 pannes dont la cause est connue d'avance, analysées par le serveur sans modèle. **8/8 avec les commandes de test, 3/8 sans** : PATH du shell de connexion, variable absente sous cron, chemin relatif, droits du dossier, fichier absent, syntaxe bash lancée par sh, service injoignable ; la vraie erreur applicative reste « cause non établie », sans cause inventée.
- Limite : scénarios écrits par nous, en connaissant les règles. C'est une preuve de fonctionnement sur de vrais cron, pas une mesure de couverture sur des pannes de clients.

### Corrigé — SDK bash sous Alpine / busybox
- `mktemp /tmp/cg_XXXXX` échouait (busybox exige 6 X) : **la sortie du job n'était jamais envoyée**. `date +%s%3N` renvoyait des secondes : durée fausse. Trouvés par le labo.

### Changé — plus de déduction par le modèle ; commandes de test à la place (2026-11-10, décision fondateur)
- Analyse des erreurs (`eval/error-analysis.ts`, 150 réponses libres sur pannes non couvertes) : 8 justes, toutes quand le log écrit le mécanisme ; 0 sur 78 quand il faut le déduire. 29 des 73 fausses causes recopiaient l'indice « Pattern détecté » du prompt ; dans 9 cas sur 12 le filtre de lignes retirait la ligne qui expliquait.
- **Par défaut, le modèle ne rédige plus de cause.** Sans fiche ni fait constaté : « Cause non établie » et des **commandes de test** — reproduire la panne dans l'environnement exact du cron (`env -i HOME=… PATH=… /bin/sh -c '<commande>'`), écarts constatés avec votre shell. `LLM_DEDUCTION=on` rétablit l'analyse libre. Code des hypothèses (v1, v2) retiré.
- **Commandes de test du SDK** (bash et Python, à l'échec, lecture seule, 3 s max, `CG_PROBE_LOGIN=0` pour désactiver) : PATH et commandes de votre shell de connexion, NOMS des variables présentes dans votre shell et absentes sous cron (jamais les valeurs), chemins cités par l'erreur (existence, relatif, propriétaire, droits). Nouvelles causes établies : commande trouvée par votre shell mais pas par le cron, variable absente sous cron (adaptée au lanceur), chemin relatif, droits insuffisants, fichier absent.

### Mesuré — raisonnement par hypothèses v2 (2026-11-10, 2e essai pré-enregistré, NON adopté, code retiré)
- Le code présélectionne 2 à 4 mécanismes, le modèle répond oui/non à un seul à la fois, réponse retenue seulement si un seul « oui ». Pannes non couvertes : 4,0 → 3,6 (écart −0,4, IC95 −0,8 à −0,05) : **pire**. Seulement 3 réponses retenues sur 58, aucune avec la bonne cause ; latence inchangée (12,9 → 13,1 s).
- Conclusion des deux essais : ni rédiger, ni choisir dans une liste, ni valider une hypothèse à la fois ne fait trouver le mécanisme à llama3.2:3b. Le découpage du raisonnement n'est pas le levier ; ne pas retenter sans changer de modèle ou d'information disponible.

### Mesuré — raisonnement par hypothèses v1 (2026-11-10, A/B apparié pré-enregistré, 97 cas × 2, NON adopté)
- Le modèle cite la ligne décisive puis choisit un mécanisme parmi 16 (cause et action reprises de la liste). Pannes non couvertes : 3,9 → 4,3 (écart +0,4, IC95 −0,35 à +1,1). Critère fixé avant l'essai (≥ +1,0 et IC > 0) **non rempli** : reste désactivé (`LLM_HYPOTHESES`).
- Cause juste sur 10 des 42 choix (24 %, contre environ 14 % en rédaction libre) ; fausses causes sûres d'elles inchangées (6 contre 6) ; latence médiane des pannes non couvertes 12,7 → 5,4 s.
- Le modèle choisit mal parmi 16 options d'un coup (sh-au-lieu-de-bash et chemin relatif à tort), comme mesuré ailleurs : un jugement noyé dans une longue liste s'effondre.

### Ajouté — lanceur du job (2026-11-10)
- Les SDK (bash, Python, Node) relèvent le lanceur : crontab, cron dans un conteneur, conteneur, timer systemd, CronJob Kubernetes, launchd. À défaut, il est déduit des logs (`CRON[…]`, `systemd[…]`, `OOMKilled`…). Détection vérifiée en conteneur sous un vrai `crond` (SDK Node).
- Le raisonnement par hypothèses ne montre que les mécanismes possibles pour ce lanceur, avec 5 mécanismes propres (variables non transmises au cron d'un conteneur, environnement d'une unité systemd, limite mémoire, planification et démarrage d'un CronJob Kubernetes). Non mesuré : les jeux d'éval ne contiennent presque que des crontabs.

### Mesuré — le modèle sert-il encore ? (2026-11-10, A/B apparié, 97 cas × 2 runs, `--ab LLM_ENABLED=false`)
- Note 7,6 avec modèle contre 7,4 sans (écart −0,2, IC95 −0,4 à −0,1). Pannes couvertes par une fiche : 9,2 dans les deux bras (le modèle n'est plus appelé). Pannes non couvertes : 4,1 contre 3,4 (écart −0,7, IC95 −1,2 à −0,2).
- Le gain du modèle tient à la catégorie (85 % contre 71 %) et à l'action (73 % contre 68 %), pas à la cause (67 % contre 66 %). Le modèle est conservé ; sans lui, CronGuard reste à 7,4.
- Le modèle n'est appelé que sur 50 analyses sur 194 ; latence moyenne 3,6 s. public5 a déjà été lu : sa note (6,0) n'est plus une mesure hors échantillon.
- `OLLAMA_KEEP_ALIVE` : chargement du modèle 4,5 s à froid contre 0,2 s à chaud (mesuré sur llama3.2:3b, CPU).

### Ajouté — boucle d'apprentissage et réactivité (2026-11-10)
- **Pannes non reconnues** : chaque analyse enregistre sa signature (ligne d'erreur décisive normalisée, sans le nom du job) et la source qui a répondu (fiche, constat, code, mémoire ; vide = non reconnue). Migration v22. Le rapport hebdomadaire liste les 5 pannes non reconnues les plus fréquentes.
- **Fiches candidates** : `GET /clients/learning` (admin) — pannes non reconnues et celles que l'équipe a déjà corrigées (✏️), avec la correction réelle, à relire avant d'en faire une fiche.
- **Mémoire partagée entre jobs** : une correction vérifiée sur un job est proposée sur un autre job du même client qui tombe sur la même signature, en confiance moyenne et en nommant le job d'origine (« Correction vérifiée sur … »). Jamais entre clients ; jamais à la place d'une fiche ou d'un constat.
- **Grâce apprise** : grâce effective = max(grâce réglée, 1,2 × p95 des 30 dernières durées réussies), dès 5 mesures, plafonnée à 24 h. Supprime la fausse alerte « en retard » des jobs plus longs que leur grâce ; contrepartie : un job vraiment absent est signalé plus tard d'autant. `LEARNED_GRACE=off`.
- **`OLLAMA_KEEP_ALIVE`** (docker-compose, défaut 24h) : le modèle reste chargé entre deux pannes.
- **`npm run eval:fiches`** : couverture, cause juste et « ratés » (une fiche qui répond à côté) sur tous les jeux, sans modèle, en ~4 s.

### Mesuré — leviers commande et contexte d'exécution (2026-11-08)
- public4 (17 pannes StackExchange collectées AVANT les leviers, commande recopiée quand le message la donne) : **5,0/10 avec les leviers, 4,6 sans** (+0,4, IC −0,4 à +1,2, non significatif). La vérification de commande règle les 2 cas où elle s'applique (2 → 8, 2 → 9). La sonde d'environnement n'est pas mesurable sur des messages publics, qui ne la contiennent pas : il faut de vrais logs SDK.

### Mesuré — note du diagnostic /10 (2026-11-08)
- Notation automatique (`eval/rubric.ts`, `eval/score.ts`), rapport `eval/REPORT.md`. Départ 4,4/10. Fiches connues 25 → 89, dont la cause remplace celle du modèle : +2,7 (IC +2,1 à +3,3). Connaissance cron dans le prompt : +0,1 (non significatif, non adoptée). qwen2.5:7b : −0,2 et 1,7× plus lent (non adopté).
- Note finale 6,8/10 tous jeux confondus, mais **3,5/10 sur public3**, le seul jeu hors échantillon (14 pannes StackExchange collectées après toutes les décisions ; modèle brut 2,0). Pannes couvertes par une fiche 8,7 ; non couvertes 3,1. C'est 3,5 qu'il faut retenir.

### Mesuré — cause profonde (2026-11-08, non adopté)
- A/B apparié pré-enregistré (`eval/ab-root-cause.ts`, 3 runs, même session, ordre alterné) : consigne « cause = le POURQUOI, pas le message recopié » contre la consigne actuelle. Cause profonde (regex du mécanisme, écartée si elle correspond déjà au log ; 9 cas publics) : **0 % dans les deux bras**, le modèle recopie le symptôme quelle que soit la consigne. Catégorie 73,0 → 75,7 % (IC −4,6 à +10, non significatif), identifiants inventés 2,7 → 1,8 %. Critère principal non rempli : prompt inchangé. Le mécanisme vient aujourd'hui des corrections connues (déterministes), pas du modèle. Résultats : `eval/results.ab-root-cause.json`.

### Ajouté
- **Fiches d'abord, modèle ensuite** : quand une fiche, la vérification de commande, la sonde d'environnement ou un code curl/rsync établit la cause, la réponse est immédiate, sans appeler le modèle. A/B apparié : note inchangée (8,4 → 8,3, non significatif), latence médiane 12,6 s → 0 s, 44 réponses sur 54 sans modèle. `LLM_KNOWLEDGE_FIRST=off` pour l'ancien comportement.
- **9 fiches tirées d'un corpus StackExchange** (160 pannes de cron) : commande tronquée au `%` dans le journal de cron, champ utilisateur manquant dans /etc/crontab, variable non développée, PHP sans shebang, systemd sans authentification, compte expiré (PAM), sudo sans terminal, plage de regex dépendante de la locale, syntaxe cron Spring ; plus le code de sortie lu dans le journal de cron et de run-parts, et « cannot connect to X server ». 106 fiches.
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
