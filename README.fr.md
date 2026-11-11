# CronGuard

**Surveillance de cron jobs auto-hébergée, qui constate pourquoi un job a échoué — et ce qui l'a réparé — sur votre propre machine. Constaté, jamais deviné.**

Un job échoue à 2h40. Les autres outils vous disent *qu'il* a cassé. CronGuard vous dit *pourquoi* :

1. **Il constate.** À l'échec, le SDK lance sur la machine du job des commandes de test en lecture seule : ce que votre shell de connexion trouve et que cron ne trouve pas (commandes, *noms* des variables d'environnement), à qui appartiennent les fichiers cités par l'erreur, qui a lancé le job (crontab, conteneur, systemd, Kubernetes, launchd).
2. **Il diagnostique sur des faits.** Ces constats, la commande du cron, une bibliothèque d'environ 110 pannes de cron connues et les codes de sortie officiels établissent la cause. Rien n'est deviné : quand rien ne l'établit, CronGuard l'écrit (« cause non établie ») et donne la commande qui reproduit la panne dans l'environnement exact du cron.
3. **Une IA locale l'explique en langage simple.** Le modèle ne choisit jamais la cause : il reformule celle qui est établie pour la personne d'astreinte. Le code rejette toute phrase qui cite un chemin, une commande ou une option absents des faits, ou qui perd une des possibilités listées.
4. **Il constate aussi la réparation.** À la première réussite après une panne, le SDK relance les mêmes vérifications et montre ce qui a changé : une variable désormais fournie, un dossier devenu modifiable, une commande modifiée. Un clic (**✓ C'est bien la correction**) l'enregistre comme correction de l'équipe ; une réparation hors du champ des vérifications (droits en base, serveur distant) est dite telle quelle, pas devinée.
5. **Il apprend de votre équipe.** Corrigez une panne depuis l'alerte (✏️) : CronGuard ressert votre correction la fois suivante, sur tous les jobs de l'équipe. **Préparer le compte rendu** ouvre le rapport d'incident dans votre propre messagerie, prérempli avec les faits, à compléter et envoyer vous-même.

**Pour qui :** équipes ops / SRE / data dont les jobs critiques (sauvegardes, ETL, synchronisation de facturation) tournent là où les logs ne doivent pas partir vers un SaaS tiers : secteur régulé, réseau isolé, ou simplement privé. Rien ne quitte votre infrastructure, IA comprise.

🇬🇧 [English version](README.md)

---

## L'astreinte, concrètement

La sauvegarde de nuit échoue. CronGuard publie dans Teams (ou Slack, Discord, ntfy…) :

> 🟠 **backup-db en échec (production)**
> **Cause (constatée) :** votre shell de connexion trouve `pg_dump` dans `/usr/lib/postgresql/16/bin`, le cron non : son PATH est `/usr/bin:/bin`.
> **Action :** appeler `/usr/lib/postgresql/16/bin/pg_dump` en chemin absolu, ou ajouter ce dossier à `PATH=` en tête de la crontab.
> `pg_dump: command not found`
> **[✅ Analyse juste]** **[✏️ Corriger]** **[Page de statut]**

- C'est juste ? Un appui sur **✅**, sans se connecter.
- C'est en partie faux ? **✏️ Corriger**, et vous écrivez ce qui a vraiment réglé la panne. La prochaine fois — sur ce job ou un autre — CronGuard ressert *votre* correction.

Quelques secondes après l'alerte, le tableau de bord ajoute une explication en langage simple par l'IA locale, vérifiée par le code. Un vrai texte de notre jeu de test (`qwen2.5:7b`) :

> *En clair :* La commande 'rake' ne peut pas être trouvée car cron démarre avec un PATH minimal qui ne contient pas /usr/local/bin. Vous devez appeler la commande en chemin absolu ou définir PATH= en tête de la crontab.

Un outil classique aurait écrit `backup-db is DOWN`.

---

## Ce qui change

| Couche | Ce qu'elle fait |
|---|---|
| **Commandes de test sur la machine** | À l'échec, le SDK (bash, Python) relève l'utilisateur réel du job, son HOME, son PATH, son shell et son lanceur, les compare à votre shell de connexion (où il trouve les commandes introuvables sous cron, les *noms* des variables absentes — jamais leurs valeurs) et inspecte les fichiers cités par l'erreur (existence, chemin relatif, propriétaire, droits). Lecture seule, 3 s maximum, `CG_PROBE_LOGIN=0` pour ne pas ouvrir le shell de connexion. |
| **Vérification de la commande** | Lit la commande du cron : `%` non échappé, mot de passe après `-p `, syntaxe bash lancée par `sh`, `rsync -e` sans guillemets, chemins relatifs, `sudo`. Prévient aussi **à l'import**, avant toute panne. |
| **Bibliothèque de pannes connues** (~110 fiches) | Messages standard des jobs et de leurs outils (PostgreSQL, MySQL, rsync, SSH, GPG, certificats, identifiants cloud, Docker, mémoire, disque…) reliés au mécanisme et à la correction. Une fiche dont le message correspond à plusieurs causes les liste toutes au lieu d'en choisir une. Chaque fiche est testée contre les pannes voisines qu'elle ne doit pas reconnaître. |
| **Codes officiels** | Code de sortie du shell (126, 127, 128+N), `curl: (N)`, `rsync (code N)` d'après leurs pages de manuel. |
| **Abstention honnête** | Pas de fait, pas de supposition : « cause non établie » et la commande qui reproduit la panne dans l'environnement exact du cron (`env -i HOME=… PATH=… /bin/sh -c '<votre commande>'`). |
| **Réparation constatée** | Le contexte de l'échec et celui de la première réussite qui suit sont comparés : ce qui a changé s'affiche sur l'analyse de la panne et se confirme en un clic. Labo : réparation visible dans 7 cas sur 11 comme fixé avant, 11 sur 11 après correction de deux défauts trouvés par le test (mêmes scénarios). |
| **Compte rendu d'incident** | Un clic le prépare dans votre messagerie (ou copie le texte pour un ticket) : heures, cause constatée, lignes de log, réparation constatée, partie « ce qui a été fait ». CronGuard n'envoie rien, aucun serveur de mail requis, aucune réécriture par l'IA. |
| **Import de crontab** | Collez une crontab dans le dashboard (ou lancez `cronguard-import.sh`) : le planning est écrit en clair par le code, l'IA locale propose un nom lisible et repère les jobs critiques, vous relisez et créez. |
| **IA locale vérifiée** | Explique en langage simple une cause établie, après l'alerte, une fois par type de panne ; nomme les jobs à l'import. Garde-fous dans le code (voir plus bas). Facultative. |
| **Mémoire de l'équipe** | Les corrections confirmées depuis l'alerte sont resservies pour la même panne. Une panne que CronGuard ne reconnaissait pas, une fois corrigée par l'équipe, devient une **fiche d'équipe** en un clic (Paramètres › Apprentissage, admins) : pré-remplie depuis la ligne d'erreur et la vraie correction, vérifiée contre les logs d'origine, puis reconnue sur tous les jobs de l'équipe sans modèle. Les pannes non reconnues sont aussi listées dans le rapport hebdomadaire. |

---

## Démarrer

**Voir l'interface sans rien installer.** Ouvrez `src/api/dashboard.html?demo=1` dans un navigateur (ou hébergez ce seul fichier n'importe où) : monitors, analyses et playground IA d'exemple, en lecture seule.

**Lancer, un seul conteneur** (PostgreSQL, Redis, API et workers dedans ; IA facultative) :

```bash
git clone https://github.com/Tenerit/cronguard && cd cronguard
docker build -f Dockerfile.allinone -t cronguard .
docker run -d --restart unless-stopped -p 3000:3000 -v cronguard-data:/data --name cronguard cronguard
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d '{"email":"vous@exemple.fr"}'   # affiche votre clé API, une seule fois
```

Ouvrez **http://localhost:3000/dashboard**. Sans modèle, les pannes ont tout sauf l'explication en langage simple ; pour l'ajouter : `-e LLM_BASE_URL=http://<hôte-ollama>:11434/v1 -e LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`. Les données sont dans le volume `cronguard-data`, avec une sauvegarde PostgreSQL au démarrage puis toutes les 24 h dans `/data/backups`, gardée 7 jours. Copiez ce dossier hors de la machine.

**Démo avec données d'exemple et IA d'explication** (télécharge `qwen2.5:7b`, ~4,7 Go au premier lancement) :

```bash
docker compose -f docker-compose.demo.yml up     # puis connexion avec la clé cg_demo_dockerdemo123456
```

**Serveur sans Internet :** sur une machine connectée, `scripts/offline-bundle.sh [dossier] [--with-model]` produit l'image, `install.sh` et `SHA256SUMS` ; `--with-model` ajoute Ollama et le modèle (plusieurs Go). Copiez le dossier, puis `sha256sum -c SHA256SUMS && ./install.sh`.

**Production avec Docker Compose :** `docker-compose.yml`, voir [DEPLOY.md](DEPLOY.md). Développement : `./setup.sh` puis `make dev`.

---

## Instrumenter vos jobs

```bash
sudo cp sdk/bash/cronguard.sh /usr/local/lib/cronguard.sh
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh            # aperçu (et risques de chaque commande)
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --apply    # crée les monitors
CRONGUARD_API_KEY=cg_live_... sdk/bash/cronguard-import.sh --systemd --apply > add-cronguard.sh   # timers systemd
```

Si le serveur a un modèle d'explication local, l'aperçu propose pour chaque job un nom lisible et son rôle (« postgres-backup — Sauvegarde la base clients avec pg_dump — tous les jours, à 02:30 ⚑ critique ») ; le planning est toujours écrit par le code. Mesuré sur 77 lignes de crontab réelles : affichage juste à 90 %, d'où l'aperçu à relire avant `--apply`. `--no-ai` garde le nom de la commande.

La crontab n'est jamais modifiée : vous relisez et recollez le résultat. Pour les timers systemd, un script à relire ajoute un `ExecStopPost=` à chaque service, sans toucher à sa commande. SDK Bash (`cg_run`), Node.js, Python et simple `curl` : voir le [README anglais](README.md#instrument-your-jobs).

---

## Notifications

Mail, Slack, **Microsoft Teams**, Discord, Google Chat, Mattermost / Rocket.Chat, **ntfy** (push sur le téléphone, auto-hébergeable), **PagerDuty** (incident résolu tout seul au rétablissement) et webhook générique signé HMAC. Configuration dans Réglages › Notifications.

**Valider ou corriger depuis l'alerte, sans se connecter.** Les boutons **✅** et **✏️** ouvrent une page signée pour cette seule analyse (HMAC, 30 jours, sans clé API). Ouvrir le lien n'enregistre rien (les messageries ouvrent les liens pour en faire un aperçu) : seul le bouton de la page le fait. Chaque action est tracée dans le journal d'audit. `APP_URL` doit être joignable depuis le téléphone d'astreinte (VPN ou intranet suffit).

Escalade vers un second contact si l'alerte n'est pas acquittée, fenêtres de maintenance et notes de runbook par monitor sont dans le tableau de bord.

---

## Quelle qualité de diagnostic ?

Mesurée, pas affirmée. Les critères sont écrits avant chaque test ; les échecs sont publiés comme les réussites ([CHANGELOG](CHANGELOG.md), [docs/EVALUATION.md](docs/EVALUATION.md)).

| Test | Résultat |
|---|---|
| **Vraies pannes cron dans un conteneur** (vrai `crond`, un utilisateur avec son `~/.profile`, SDK bash et Python, 11 pannes de cause connue) | **11 sur 11 causes établies avec les commandes de test, 3 sur 11 sans** ; le vrai bug applicatif reste « non établi », rien d'inventé. Scénarios écrits par nous : preuve que ça marche sur un vrai cron, pas un taux de couverture. |
| **Pannes StackExchange hors échantillon** (public6, 15 cas collectés avant les changements) | Causes fausses affirmées : **12 sur 30 sans déduction par le modèle, contre 20 sur 30 avec**, pour autant de causes justes. Note 3,9/10 contre 4,2 (écart non significatif). Ces cas n'ont que des logs, sans commandes de test. |
| Pannes couvertes par la bibliothèque | 9,2/10 sur les cas de réglage, **5,0 hors échantillon** : la bibliothèque se généralise imparfaitement, d'où l'apprentissage par votre équipe. |

**Le chiffre qui compte n'existe pas encore :** combien de *vos* pannes CronGuard explique. Essayez-le sur vos jobs ; le rapport hebdomadaire montre ce qu'il n'a pas reconnu.

---

## IA locale — vérifiée, facultative

Nous avons mesuré ce qu'un modèle local fait bien. Pour **trouver** une cause inconnue, un modèle 3B se trompait environ une fois sur deux et ne trouvait jamais un mécanisme que le log n'écrit pas (0 sur 78). Le modèle ne choisit donc **plus jamais la cause**. Pour **expliquer** une cause établie en langage simple, un modèle 7B s'en sort bien :

| `qwen2.5:7b-instruct`, 80 causes établies (attentes fixées avant le test) | Résultat |
|---|---|
| Explications produites (acceptées par les garde-fous) | **84 %** |
| Rien d'inventé (aucun chemin, option ou fichier absent des faits) | **100 %** |
| Mécanisme gardé | **97 %** |
| Relecture humaine de chaque texte accepté : sens déformé | 4 sur 67 (6 %) |
| Temps médian, après l'alerte | 15,5 s |

`llama3.2:3b` échoue au même test (76 % de mécanismes gardés) : l'explication demande le 7B.

**Deuxième rôle — nommer les jobs à l'import.** Quand le code écrit le planning et que le modèle ne reçoit que la commande, ce qu'affiche CronGuard (nom, rôle, planning) est juste pour 69 lignes de crontab réelles sur 77 (90 %), et les jobs critiques sont bien repérés dans 96 % des cas. Vous relisez les noms avant toute création.

**Rôles essayés puis écartés**, chacun mesuré contre des attentes fixées avant : réécrire le compte rendu de l'équipe (sens déformé une fois sur cinq), poser des questions d'enquête (génériques, 19 % pointent la cause), retrouver une ancienne réparation par ressemblance (46 % de précision), repérer les secrets que les règles ratent (18 % de journaux propres masqués à tort). Le motif : un 7B reformule ou nomme bien une entrée courte et sûre ; il échoue dès qu'il doit juger ou deviner. Détails dans le [CHANGELOG](CHANGELOG.md).

**Les garde-fous sont dans le code, pas dans le prompt :** l'explication est écartée (la cause vérifiée s'affiche seule) si elle cite un identifiant absent des faits, perd une des possibilités listées par la cause, ou dépasse trois phrases. La cause vérifiée reste toujours affichée au-dessus, étiquetée.

**Un coût contenu :**
- **Installation légère par défaut** — sans modèle ; tout ce qui précède sauf l'explication en langage simple.
- **Installation avec IA :** `ollama pull qwen2.5:7b-instruct-q4_K_M` (~4,7 Go, ~5 Go de RAM, CPU suffisant) et `LLM_EXPLAIN_MODEL=qwen2.5:7b-instruct-q4_K_M`.
- **Jamais sur le chemin de l'alerte :** l'explication est écrite après l'envoi de l'alerte.
- **Une fois par type de panne :** gardée 30 jours par cause et ligne d'erreur normalisée ; une panne qui revient ne relance jamais le modèle.
- **Un seul serveur IA pour toute l'entreprise :** pointez `LLM_BASE_URL` vers une machine Ollama partagée (avec ou sans GPU) du réseau interne ; toutes les installations CronGuard l'utilisent, rien ne sort.

`LLM_DEDUCTION=on` rétablit l'ancien diagnostic rédigé par le modèle (pour comparaison, déconseillé). Tout serveur local compatible OpenAI convient (vLLM, llama.cpp, LM Studio).

---

## Sécurité et accès

Clés API stockées en empreinte SHA-256, rôles `viewer < member < admin < owner`, invitations par lien, rotation de clés, journal d'audit. SSO par votre reverse-proxy (oauth2-proxy, Authelia, Pomerium, passerelle SAML/OIDC) : l'application ne contacte jamais de fournisseur d'identité. CSP stricte pour les scripts, secrets (mots de passe, jetons, clés, identifiants dans les URL, `mysql -p…`) masqués dans la sortie des jobs et leurs commandes dès leur arrivée, avant toute file d'attente ou tout stockage, garde SSRF sur tous les webhooks sortants. Voir [SECURITY.md](SECURITY.md).

---

## Licence et tarifs

**Auto-hébergé : gratuit, MIT, toutes les fonctions.** Les offres payantes sont l'hébergement et le support, pas des fonctions verrouillées. Contribuer : [CONTRIBUTING.md](CONTRIBUTING.md) (`npm run ci` doit passer).

[MIT](LICENSE)
