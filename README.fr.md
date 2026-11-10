# CronGuard

**Surveillance de cron jobs auto-hébergée, qui diagnostique les pannes sur votre propre machine.**

Un job échoue à 2h40. Les autres outils vous disent *qu'il* a cassé. CronGuard vous dit *pourquoi*, quand il peut le savoir, à partir de trois sources qui ne quittent jamais vos serveurs : une bibliothèque de pannes de cron connues, ce qu'il constate sur la machine (la commande du cron, l'environnement réel du job, les codes de sortie), et un modèle d'IA local pour le reste. Quand il ne peut pas établir la cause, il le dit au lieu de deviner.

**Pour qui :** équipes ops / SRE / data dont les jobs critiques (sauvegardes, ETL, synchronisation de facturation) tournent sur une infrastructure dont les logs ne doivent pas partir vers un SaaS tiers : secteur régulé, réseau isolé, ou simplement privé. Rien ne quitte votre infrastructure, IA comprise.

🇬🇧 [English version](README.md)

---

## L'astreinte, concrètement

La sauvegarde de nuit échoue. CronGuard publie dans Teams (ou Slack, Discord, ntfy…) :

> 🟠 **backup-db en échec (production)**
> **Cause :** le binaire pg_dump utilisé par le cron est plus ancien que le serveur PostgreSQL (version majeure inférieure).
> **Piste à vérifier :** appeler un pg_dump de la version du serveur en chemin absolu, ou installer postgresql-client à jour.
> `pg_dump: error: aborting because of server version mismatch`
> **[✅ Analyse juste]** **[✏️ Corriger]** **[Page de statut]**

- C'est juste ? Un appui sur **✅**, sans se connecter.
- C'est en partie faux ? **✏️ Corriger**, et vous écrivez ce qui a vraiment réglé la panne. La prochaine fois, CronGuard ressert *votre* correction, sans appeler le modèle.

Un outil classique aurait écrit `backup-db is DOWN`.

---

## Ce qui change

| Source du diagnostic | Ce qu'elle fait |
|---|---|
| **Bibliothèque de pannes connues** (97 fiches) | Messages standard des jobs et de leurs outils (PostgreSQL, MySQL, rsync, SSH, GPG, certificats, identifiants cloud, Docker, mémoire, disque…) reliés au mécanisme et à la correction. Chaque fiche est testée contre les pannes voisines qu'elle ne doit pas reconnaître. |
| **Vérification de la commande** | Lit la commande du cron : `%` non échappé, mot de passe après `-p `, syntaxe bash lancée par `sh`, `rsync -e` sans guillemets, chemins relatifs, `sudo`. Prévient aussi **à l'import**, avant toute panne. |
| **Sonde d'environnement** | À l'échec, le SDK remonte l'utilisateur réel du cron, son HOME, son PATH, son shell, sa locale, la présence de DISPLAY et de l'agent SSH, et l'endroit où une commande « introuvable » existe réellement sur la machine. Des noms et des chemins, aucune valeur secrète. |
| **Codes officiels** | Code de sortie du shell (126, 127, 128+N : 137 OOM/SIGKILL, 143 SIGTERM…), `curl: (N)` et `rsync (code N)` d'après leurs pages de manuel. |
| **Modèle d'IA local** | `llama3.2:3b` via Ollama, sur CPU. Utilisé quand rien de ce qui précède ne s'applique, avec une confiance plafonnée ; s'il ne fait que recopier la ligne d'erreur, l'alerte indique que la cause n'est pas établie. |
| **Mémoire de l'équipe** | Les corrections confirmées depuis l'alerte sont resservies pour la même panne. Elle s'enrichit à l'usage et reste chez vous. |

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

Ouvrez **http://localhost:3000/dashboard**. Sans modèle, les pannes ont quand même les fiches connues, les vérifications de commande et d'environnement et les lignes de log liées ; pour l'IA locale : `-e LLM_BASE_URL=http://<hôte-ollama>:11434/v1`. Les données sont dans le volume `cronguard-data`, avec une sauvegarde PostgreSQL au démarrage puis toutes les 24 h dans `/data/backups`, gardée 7 jours. Copiez ce dossier hors de la machine.

**Démo avec données d'exemple et modèle :**

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

La crontab n'est jamais modifiée : vous relisez et recollez le résultat. Pour les timers systemd, un script à relire ajoute un `ExecStopPost=` à chaque service, sans toucher à sa commande. SDK Bash (`cg_run`), Node.js, Python et simple `curl` : voir le [README anglais](README.md#instrument-your-jobs).

---

## Notifications

Mail, Slack, **Microsoft Teams**, Discord, Google Chat, Mattermost / Rocket.Chat, **ntfy** (push sur le téléphone, auto-hébergeable), **PagerDuty** (incident résolu tout seul au rétablissement) et webhook générique signé HMAC. Configuration dans Réglages › Notifications.

**Valider ou corriger depuis l'alerte, sans se connecter.** Les boutons **✅** et **✏️** ouvrent une page signée pour cette seule analyse (HMAC, 30 jours, sans clé API). Ouvrir le lien n'enregistre rien (les messageries ouvrent les liens pour en faire un aperçu) : seul le bouton de la page le fait. Chaque action est tracée dans le journal d'audit. `APP_URL` doit être joignable depuis le téléphone d'astreinte (VPN ou intranet suffit).

Escalade vers un second contact si l'alerte n'est pas acquittée, fenêtres de maintenance et notes de runbook par monitor sont dans le tableau de bord.

---

## Quelle qualité de diagnostic ?

Mesurée automatiquement sur de vraies pannes. Chaque réponse est notée sur 10 par du code ([eval/rubric.ts](eval/rubric.ts)) : mécanisme (4), action juste et sûre (3), catégorie (1), rien d'inventé (1), ligne décisive (1), ±1 pour l'honnêteté.

| Jeu | Note /10 |
|---|---|
| Pannes couvertes par la bibliothèque | **9,2** |
| Pannes non couvertes (le modèle local seul) | **3,7** |
| Les 85 cas utilisés pour le réglage | **7,8**, optimiste puisque ces cas ont été lus |
| **Test hors échantillon (public5) : 12 pannes StackExchange collectées après tous les changements** | **4,7** (runs 4,4 à 4,8) ; le modèle local seul : 1,9 |

C'est le chiffre hors échantillon qui compte. Sur ce jeu, CronGuard a reconnu 4 pannes sur 12 grâce à une fiche (8,0 sur celles-ci) et obtient 3,0 sur les autres. Méthode complète, toutes les expériences (y compris celles qui n'ont rien apporté) et comment noter vos propres logs : [docs/EVALUATION.md](docs/EVALUATION.md).

---

## Modèle d'IA local

Par défaut **`llama3.2:3b` via Ollama**, rapide sur CPU. **Le modèle est facultatif** : sans `LLM_BASE_URL` (ou avec `LLM_ENABLED=false`), tout fonctionne sauf la rédaction libre du modèle. Tout serveur local compatible OpenAI convient (vLLM, serveur llama.cpp, LM Studio). La mémoire d'incidents (`MEMORY_ENABLED`) et le cache par empreinte d'erreur évitent de rappeler le modèle pour une panne déjà vue.

---

## Sécurité et accès

Clés API stockées en empreinte SHA-256, rôles `viewer < member < admin < owner`, invitations par lien, rotation de clés, journal d'audit. SSO par votre reverse-proxy (oauth2-proxy, Authelia, Pomerium, passerelle SAML/OIDC) : l'application ne contacte jamais de fournisseur d'identité. CSP stricte pour les scripts, secrets (mots de passe, jetons, clés, identifiants dans les URL, `mysql -p…`) masqués dans la sortie des jobs et leurs commandes dès leur arrivée, avant toute file d'attente ou tout stockage, garde SSRF sur tous les webhooks sortants. Voir [SECURITY.md](SECURITY.md).

---

## Licence et tarifs

**Auto-hébergé : gratuit, MIT, toutes les fonctions.** Les offres payantes sont l'hébergement et le support, pas des fonctions verrouillées. Contribuer : [CONTRIBUTING.md](CONTRIBUTING.md) (`npm run ci` doit passer).

[MIT](LICENSE)
