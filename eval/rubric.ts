/**
 * Grille de notation /10, appliquée par du code (aucun juge humain ni LLM) : chaque point se justifie.
 *
 *   Cause = le mécanisme   4  la regex MECH du cas trouve le POURQUOI dans « cause » (pas le symptôme)
 *   Action juste et sûre   3  la regex ACT trouve une action qui règle la panne, et rien de FORBIDDEN
 *   Catégorie exacte       1
 *   Rien d'inventé         1  aucun chemin / option / identifiant absent des logs (unverifiableIdentifiers)
 *   Preuve                 1  les lignes de log liées à la cause contiennent la ligne décisive (KEY)
 *   Honnêteté            ±1  +1 si la cause dit ne pas savoir avec une confiance basse ; −1 si la cause est
 *                            fausse avec une confiance haute. Note bornée à [0, 10].
 *
 * Étiquettes écrites d'après la cause établie (fil public, ou ligne NOTE du scénario labo), le
 * 2026-11-08, sans relire les sorties du modèle sur ces champs. Quand un log contient déjà la cause
 * (« NOTE: security team rotated… »), la citer EST trouver la cause : la regex peut la reprendre.
 */
import type { AnalysisResult } from '../src/services/llm/analyzer'
import { evidenceLines } from '../src/services/llm/evidence'
import { unverifiableIdentifiers } from './quality'

export interface Label { mech: RegExp; act: RegExp; key: RegExp }

export const LABELS: Record<string, Label> = {
  // ── Labo ────────────────────────────────────────────────────────────────────
  'pg-connection-refused':          { mech: /arrêt|\bdown\b|tombé|ne tourne pas|not running|stopp|crash|n'écoute pas|not listening|listen_addresses|hors service|indisponible|unavailable/i,
                                      act: /systemctl|démarr|\bstart|redémarr|restart|pg_isready|état du service|status/i, key: /Connection refused/ },
  'pg-too-many-connections':        { mech: /satur|épuis|exhaust|\bplein|fuite|leak|toutes les connexions|limite.{0,25}atteint|atteint.{0,25}(limite|max)|in use: 100|100\s*\/\s*100/i,
                                      act: /pgbouncer|pool|max_connections|idle|pg_terminate|fermer|libér|terminate/i, key: /too many clients|max_connections/ },
  'mysql-deadlock':                 { mech: /concurren|simultan|parallèle|deux (transactions|jobs)|autre (transaction|processus|job)|ordre|croisé|contention|mêmes? lignes?/i,
                                      act: /ordre|\blots?\b|batch|plus petit|réessay|retry|horaire|décal|isolation|index/i, key: /Deadlock found/ },
  'pg-disk-full-wal':               { mech: /pg_wal|wal.{0,30}(rempli|plein|accumul|croiss)|(disque|partition|volume).{0,30}(plein|full|100\s*%)/i,
                                      act: /libér|purg|étendre|agrandir|augmenter|archiv|réplication|slot|nettoy|espace/i, key: /No space left|100%/ },
  'dns-resolution-failure':         { mech: /\bdns\b|résolu|resolv|nameserver|10\.0\.0\.2|serveur de noms/i,
                                      act: /\bdns\b|resolv|nameserver|10\.0\.0\.2|\bdig\b|nslookup/i, key: /resolve host|ENOTFOUND/ },
  'tls-cert-expired':               { mech: /expir/i, act: /renouvel|renew|certbot|nouveau certificat/i, key: /certificate has expired|valid until/ },
  'econnreset-mid-transfer':        { mech: /coupé|réinitialis|\breset|interromp|fermée? par|distant|\bpeer\b|partenaire|instable/i,
                                      act: /reprendre|resume|relanc|retry|réessay|renvoy|morceaux|chunk/i, key: /ECONNRESET|reset by peer/ },
  'route-unreachable-vpn':          { mech: /\bvpn\b|tunnel/i, act: /\bvpn\b|tunnel|vpn-gw/i, key: /VPN|EHOSTUNREACH/ },
  'watchdog-sigkill':               { mech: /(dépass|exceed|trop long|plus (de|que)).{0,40}(3600|limite|1\s*h|heure)|3600|limite de temps|soft limit/i,
                                      act: /découp|chunk|incrément|parallél|limite|timeout|augment|optimis|reprise/i, key: /exceeded soft limit|SIGKILL/ },
  'http-client-timeout':            { mech: /ne répond|lent|indispon|injoign|surcharg|\bdown\b|panne|aucune réponse|0 bytes|0 octet/i,
                                      act: /fournisseur|vendor|statut|status|retry|réessay|timeout|contact|backoff/i, key: /timed out after 30000/ },
  'query-statement-timeout':        { mech: /480\s*m|480 ?millions|volume|croissance|taille de la table|table.{0,20}(grossi|grande|volumin)|\bindex|scan/i,
                                      act: /\bindex|partition|statement_timeout|optimis|agrég|incrément|created_at/i, key: /statement timeout|480M/ },
  'oom-killer-137':                 { mech: /(charg|load).{0,40}(mémoire|memory)|trop de (données|lignes)|14\s*m|matrice|dépass.{0,20}(16|limite)|limite.{0,20}16/i,
                                      act: /chunk|\blots?\b|batch|streaming|morceaux|limite|16gi|augment|mémoire/i, key: /Out of memory|OOMKilled/ },
  'disk-full-enospc':               { mech: /rotation|412|accumul|jamais supprim|aucune purge|pas de purge|anciennes? (archives|sauvegardes)/i,
                                      act: /rotation|purg|supprim|rétention|retention|logrotate|nettoy|anciennes/i, key: /No space left|100%/ },
  'fork-cannot-allocate':           { mech: /(8|huit) (workers|processus)|trop de (workers|processus)|parallél|mémoire (disponible|libre)|31\s*mo|available 31|\bram\b/i,
                                      act: /réduire|moins de|workers|parallél|mémoire|swap/i, key: /Cannot allocate memory|available 31/ },
  'inode-exhaustion':               { mech: /inode/i, act: /inode|petits fichiers|archive|regroup|supprim|nettoy|mkfs|bytes-per-inode/i, key: /Inodes exhausted|100%/ },
  'stripe-rate-limit-429':          { mech: /(trop de|nombre de) (requêtes|appels)|rate limit|limite de (débit|requêtes)|cadence|rafale|burst|429/i,
                                      act: /retry-after|17\s*s|backoff|attendre|espacer|ralentir|limiter|throttl/i, key: /rate limit|429/ },
  'api-key-revoked-401':            { mech: /rotat|révoqu|revoked|sec-2291|clé.{0,30}(changé|remplac|ancienne)/i,
                                      act: /nouvelle clé|\bclé|\bkey|secret|sec-2291/i, key: /rotated|401/ },
  'vendor-maintenance-503':         { mech: /maintenance/i, act: /attendre|06:00|après|retry|relanc|planifi|reprogramm/i, key: /maintenance/ },
  'geocoding-quota-exceeded':       { mech: /quota/i, act: /quota|minuit|midnight|augment|attendre|\blots?\b|répartir|cache/i, key: /Quota exceeded/ },
  'typeerror-undefined-prop':       { mech: /tier_v2|nouvelle colonne|renomm|schéma|deploy|déploiement|2241|migration/i,
                                      act: /tier_v2|bonus\.js|computebonus|adapter|corrig|garde|rollback|revert/i, key: /tier_v2|reading 'tier'/ },
  'python-keyerror':                { mech: /gross_amount\b|renomm|colonne.{0,30}(absent|chang|manquant)|en-tête|header|amont/i,
                                      act: /gross_amount|mapping|colonne|reconcile_payments|adapter|corrig/i, key: /Upstream CSV columns|KeyError/ },
  'syntax-error-bad-deploy':        { mech: /f3c2a91|déploi|deploy|commit|8841|quick fix|dernier (déploiement|changement)/i,
                                      act: /revert|rollback|annul|f3c2a91|corrig|retour/i, key: /SyntaxError|f3c2a91/ },
  'unhandled-rejection-null-order': { mech: /(commande|order).{0,30}(null|nulle|absente|supprim|manquant)|\bnull\b/i,
                                      act: /\bnull\b|garde|vérif|filtr|cart\.js|ignorer|skip/i, key: /as it is null/ },
  'validation-null-ids':            { mech: /source|amont|producteur|fournisseur|extraction|customer_id.{0,30}null|null.{0,20}customer_id/i,
                                      act: /source|amont|producteur|équipe|corrig|relanc|retraiter|vérif/i, key: /NULL customer_id|QUARANTINED/ },
  'csv-encoding-garbage':           { mech: /utf-?16|encodage|\bbom\b|outil d'export|export tool/i,
                                      act: /iconv|convert|utf-?8|encodage|encoding|fournisseur|supplier/i, key: /UTF-16|0xff/ },
  'schema-drift-extra-column':      { mech: /consent_flags|nouvelle colonne|14.{0,10}13|schéma.{0,30}(chang|évolu|modifi)|tracking-consent|418/i,
                                      act: /consent_flags|alter|ajout|colonne|schéma|mapping|ignorer/i, key: /consent_flags|schema mismatch/ },

  // ── Public (cause établie dans le fil source) ───────────────────────────────
  'pub-pg-dump-version-mismatch-cron':      { mech: /ancien|older|antérieur|plus vieux|obsolète|inférieur|en retard|outdated|plus récent|newer/i,
                                              act: /mettre à jour|upgrade|install|version|pg_dump/i, key: /version mismatch/ },
  'pub-gitlab-backup-pg-dump-mismatch':     { mech: /ancien|older|antérieur|plus vieux|obsolète|inférieur|en retard|outdated|plus récent|newer/i,
                                              act: /mettre à jour|upgrade|install|version|pg_dump|client/i, key: /version mismatch/ },
  'pub-certbot-timeout-aaaa-old-provider':  { mech: /ipv6|aaaa/i, act: /ipv6|aaaa|dns|enregistrement|record/i, key: /Timeout during connect/ },
  'pub-certbot-timeout-firewall-restarted': { mech: /\b80\b|\bport\b|http-01|pare-feu.{0,30}(bloqu|ferm|redémarr)|firewall.{0,30}(block|clos|restart)/i,
                                              act: /\b80\b|port|pare-feu|firewall|ouvrir|autoriser|ufw|iptables/i, key: /Timeout during connect/ },
  'pub-mysqldump-lock-tables-privilege':    { mech: /privil|grant|droit/i, act: /grant|privil|droit|single-transaction|skip-lock-tables/i, key: /LOCK TABLES/ },
  'pub-velero-x509-unknown-authority':      { mech: /\bca\b|autorit|cacert|ca-cert|auto-?sign|self-signed|confiance|trust/i,
                                              act: /\bca\b|cacert|ca-cert|certificat|confiance|trust|bundle/i, key: /unknown authority/ },
  'pub-borg-not-found-cron-path':           { mech: /\bpath\b|\/usr\/local\/bin|chemin|environnement (du|de) cron/i,
                                              act: /\bpath\b|chemin|\/usr\/local\/bin|absolu|which/i, key: /not installed/ },
  'pub-weaviate-x509-legacy-cn':            { mech: /\bsans?\b|subject alt|common name|\bcn\b/i, act: /\bsan\b|subject alt|certificat|régénér|regenerat/i, key: /x509|Common Name/ },
  'pub-aws-s3-sync-sso-expired':            { mech: /sso|session.{0,20}expir/i, act: /sso login|aws2? sso|reconnect|se reconnecter|renouvel|refresh/i, key: /SSO session/ },
  'pub-s3-upload-expired-token':            { mech: /\bsts\b|temporaire|temporary|durée|duration|session/i, act: /renouvel|refresh|nouveau jeton|nouveaux identifiants|credentials|durée|duration|rôle|role/i, key: /ExpiredToken|expired/ },
  'pub-node-heap-oom-backup':               { mech: /défaut|default|volume|taille|trop (gros|grand|volumineux)|max-old-space|NODE_OPTIONS/i,
                                              act: /max-old-space|NODE_OPTIONS|mémoire|memory|heap|tas|\blots?\b|morceaux/i, key: /heap/ },

  // ── Public2 (TEST, collecté après le gel des fiches ; cause = réponse acceptée) ──
  'p2-cron-perm-denied-owner':   { mech: /utilisateur|propriétaire|owner|www-data|apache|droits? (sur|du|d'écriture)/i, act: /chown|chmod|www-data|utilisateur|crontab -u|\bsu\b/i, key: /permission denied/i },
  'p2-php-mysqli-env-vars':      { mech: /variables?|environnement|DB_SERVER|non définies?|vides?/i, act: /variables?|crontab|export|environnement|DB_/i, key: /No such file or directory/ },
  'p2-rake-path-rvm':            { mech: /\bpath\b|rvm|chemin/i, act: /\bpath\b|chemin|absolu|rvm|which/i, key: /command not found/ },
  'p2-crontab-percent':          { mech: /%|pourcent|percent/i, act: /%|échapp|escape/i, key: /backquote|Syntax error/ },
  'p2-mysqldump-p-space':        { mech: /espace|space|-p ?(collé|sans espace)|mot de passe (n'est |n'a )?(pas|jamais) (été )?(transmis|passé|fourni|envoyé)|sans mot de passe/i,
                                   act: /espace|space|-p|my\.cnf|defaults-extra-file/i, key: /1045/ },
  'p2-pg-dump-pgpass-root':      { mech: /\broot\b|\.pgpass|pgpass|\bhome\b|utilisateur du cron/i, act: /\.pgpass|pgpass|\broot\b|crontab -e|PGPASSWORD|PGPASSFILE/i, key: /no password supplied/ },
  'p2-docker-no-space':          { mech: /--rm|conteneurs?|volumes? docker|images? docker|docker (system )?prune/i, act: /--rm|prune|conteneurs?|volumes?|images?/i, key: /no space left/i },
  'p2-cron-malware':             { mech: /compromis|malware|virus|piraté|intrus|attaque|crypto-?min|malveillant/i, act: /compromis|réinstall|malware|nettoy|mot de passe|\bssh\b|isoler|supprim/i, key: /\.X17-unix|\.bashtemp/ },
  'p2-curl-60-ca-bundle':        { mech: /\bca\b|bundle|cacert|autorit|certificats? (racines?|ca)|update-ca|magasin/i, act: /update-ca|cacert|bundle|\bca\b|certificats?/i, key: /\b60\b/ },
  'p2-spring-sftp-duplicate':    { mech: /\bbug\b|version|plusieurs instances|concurren|simultan|on conflict|doublon|duplicate/i, act: /mettre à jour|upgrade|version|on conflict|verrou|lock|une seule instance/i, key: /MessagingException|synchroniz/ },
  'p2-ffmpeg-display-boot':      { mech: /pas (encore )?(prête|démarrée|lancée|disponible)|au démarrage|après (le )?(re)?démarrage|reboot|attendre|délai/i, act: /attendre|délai|sleep|après|plus tard|@reboot/i, key: /Cannot open display/ },
  'p2-python-ascii-encode':      { mech: /locale|encodage (par défaut|du terminal|de sortie)|default encoding|utf-?8|lc_all|\blang\b/i, act: /utf-?8|encode|lc_all|\blang\b|pythonioencoding|locale/i, key: /UnicodeEncodeError/ },
  'p2-node-path-global':         { mech: /node_path|modules? globa|environnement|npm (install )?-g|chemin des modules/i, act: /node_path|npm install|chemin|environnement/i, key: /Cannot find module/ },
  'p2-php-oom-ssh-safe-mode':    { mech: /\bssh\b|mode (sans échec|safe)|cpanel/i, act: /\bssh\b|cpanel|redémarr|\bport\b/i, key: /Out of memory/ },
  'p2-aws-env-cron':             { mech: /variables? d'environnement|environnement (du )?cron|crontab|aws_access_key|non définies?|\bhome\b|profil/i, act: /crontab|variables?|aws_access_key|aws configure|environnement|profil|credentials/i, key: /Unable to locate credentials/ },
  'p2-selenium-path':            { mech: /\bpath\b|chemin|\/usr\/s?bin/i, act: /\bpath\b|chemin|\/usr\/s?bin/i, key: /Chrome failed to start/ },
  'p2-git-ssh-key-cron':         { mech: /clé ssh|ssh key|\bagent\b|passphrase|mot de passe|clé (privée|dédiée)/i, act: /clé|\bkey\b|https|ssh-keygen|\bagent\b/i, key: /Permission denied/ },

  // ── Public3 (TEST FINAL, collecté après la lecture des sorties sur public2) ──
  'p3-ruby-rvm-env':                { mech: /\brvm\b|environnement|\bpath\b|ruby (du|de) (système|rvm)/i, act: /\brvm\b|source|environnement|\bpath\b|wrapper|chemin/i, key: /exit status 1/ },
  'p3-smtp-port-blocked':           { mech: /\bport\b|587|hébergeur|bluehost|bloqu|pare-feu|firewall/i, act: /\bport\b|443|\b80\b|relais|hébergeur|smtp|service/i, key: /Network is unreachable/ },
  'p3-mysqldump-password-unquoted': { mech: /mot de passe|password|guillemets?|quot|caractères? spéciaux/i, act: /guillemets?|quot|échapp|my\.cnf|defaults-extra-file/i, key: /not found/ },
  'p3-venv-env-var':                { mech: /activate|variable d'environnement|virtualenv|venv|non (chargé|sourcé)|environnement/i, act: /activate|source|variable|crontab|environnement/i, key: /KeyError/ },
  'p3-crontab-percent-date':        { mech: /%|pourcent|percent/i, act: /%|échapp|escape|script/i, key: /unexpected EOF/ },
  'p3-rsync-e-quotes':              { mech: /guillemets?|quot|un seul argument|option -e|-e ssh/i, act: /guillemets?|quot|-e ?["']/i, key: /link_stat/ },
  'p3-node-full-path':              { mech: /\bpath\b|chemin (complet|absolu)|\/usr\/local\/bin/i, act: /\/usr\/local\/bin\/node|chemin (complet|absolu)|\bpath\b/i, key: /Can't open node|Syntax error/ },
  'p3-java-classpath':              { mech: /classpath|-cp\b|\bjars?\b/i, act: /classpath|-cp\b|\bjars?\b/i, key: /NoClassDefFoundError/ },
  'p3-scp-agent':                   { mech: /\bagent\b|session|clé (sans|dédiée)|passphrase|mot de passe/i, act: /clé|ssh-keygen|sans (mot de passe|passphrase)|authorized_keys|-i\b/i, key: /Permission denied \(publickey\)/ },
  'p3-tar-path-spaces':             { mech: /espaces?|guillemets?|quot|dossier (n'existe|inexistant|absent)|répertoire (n'existe|inexistant|absent)/i, act: /guillemets?|quot|mkdir|créer/i, key: /Cannot open/ },
  'p3-venv-activate-path':          { mech: /activate|virtualenv|venv|saut de ligne|retour (à la ligne|chariot)|crlf/i, act: /bin\/python|python du (venv|virtualenv)|chemin absolu|sans activate|retirer/i, key: /activate/ },
  'p3-activate-path-bashrc':        { mech: /\bpath\b|\.bashrc|\.profile|chemin/i, act: /chemin (complet|absolu)|\bpath\b|source/i, key: /activate/ },
  'p3-git-push-root-home':          { mech: /\broot\b|\bhome\b|utilisateur|\.ssh/i, act: /\bhome\b|\.ssh|\broot\b|crontab de|utilisateur/i, key: /Permission denied \(publickey\)/ },
  // ── Public5 (TEST, collecté le 2026-11-10 après tous les changements du 2026-11-08) ──
  'p5-ruby-shebang-127':           { mech: /shebang|interpréteur|ruby (introuvable|absent|n'existe)|chemin (de|vers|du) ruby|\bpath\b/i, act: /shebang|chemin|which ruby|\bpath\b/i, key: /exit status 127/ },
  'p5-crontab-percent-expr':       { mech: /%|pourcent|percent/i, act: /%|échapp/i, key: /exit status 2|expr/ },
  'p5-cronhourly-crontab-syntax':  { mech: /cron\.hourly|run-parts|syntaxe (de )?crontab|ligne (de )?crontab|format (de )?crontab|path=.{0,40}script/i, act: /script|#!\/bin\/(ba)?sh|retirer|déplacer|crontab/i, key: /bin: command not found|return code 127/ },
  'p5-svn-sshpass-noninteractive': { mech: /interacti|invite|prompt|\btty\b|terminal/i, act: /--force-interactive|--password|identifiants|credentials|interacti/i, key: /Authentication failed/ },
  'p5-perl-env-login-shell':       { mech: /environnement|login|\.profile|perl5lib|\bpath\b|autre (perl|version)|shell de connexion/i, act: /-l -c|login|\.profile|perl5lib|environnement|\bpath\b/i, key: /not exported by the Time::Local/ },
  'p5-python-version-import':      { mech: /version|python (différent|autre)|plusieurs python|interpréteur|virtualenv|venv/i, act: /chemin (complet|absolu)|\/usr\/local\/bin\/python|interpréteur/i, key: /No module named/ },
  'p5-php-set-time-limit':         { mech: /set_time_limit|limite (de temps|d'exécution) (fixée|posée|définie)|max_execution_time/i, act: /set_time_limit|max_execution_time|ini_set/i, key: /Maximum execution time/ },
  'p5-env-node-bashrc':            { mech: /\bpath\b|\.bashrc|environnement|\bnvm\b/i, act: /\bpath\b|chemin (complet|absolu)|environnement|source|script/i, key: /node: No such file/ },
  'p5-unixcat-path':               { mech: /\bpath\b|chemin/i, act: /which|chemin (complet|absolu)|\bpath\b/i, key: /unixcat: command not found/ },
  'p5-macos-tcc-trash':            { mech: /\btcc\b|confidentialit|privacy|accès complet au disque|full disk access|macos|sandbox/i, act: /accès complet|full disk access|launchd|autoriser|réglages|préférences/i, key: /Operation not permitted/ },
  'p5-proxy-env-cron':             { mech: /proxy|http_proxy|variable d'environnement|environnement/i, act: /proxy|http_proxy|https_proxy|export|environnement/i, key: /timed out/ },
  'p5-wget-ssl-status5':           { mech: /\bssl\b|\btls\b|certificat|https|redirection/i, act: /https|certificat|redirection|\bssl\b/i, key: /status 5/ },

  // ── Public6 (TEST, gelé brut le 2026-11-10 avant le retrait de la déduction ; étiquettes écrites avant tout run) ──
  'p6-sysctl-path':              { mech: /\bpath\b|\/sbin/i, act: /\/sbin|path=|chemin absolu|absolute/i, key: /sysctl/ },
  'p6-rvm-gem-path':             { mech: /\brvm\b|\bpath\b|environnement|environment|gem_(home|path)|bash_profile|\.profile/i, act: /\brvm\b|\bpath\b|gem_|source|environ|profile/i, key: /nokogiri/ },
  'p6-java-noclassdef-pom':      { mech: /dépendance|dependency|\bpom\b|classpath|bibliothèque|library|\bjar\b|empaquet|packag/i, act: /\bpom\b|dépendance|dependency|maven|archetype|classpath|\bjar\b/i, key: /NoClassDefFoundError/ },
  'p6-rake-bundle-env':          { mech: /\bpath\b|environnement|environment|\brvm\b|rbenv|bashrc|profile/i, act: /\bpath\b|source|\brvm\b|rbenv|bashrc|profile|chemin absolu|environ/i, key: /bundle: command not found|rake: command not found/ },
  'p6-pgdump-crlf':              { mech: /crlf|\\r|retours? (à la ligne |)chariot|carriage|dos2unix|fins? de ligne|windows|\bdos\b/i, act: /dos2unix|crlf|\\r|fins? de ligne|line ending/i, key: /--file: command not found|--table: command not found/ },
  'p6-redis-dump-umask':         { mech: /umask|droits? (de création|du fichier|du dump)|propriétaire|owner|créé avec|created with/i, act: /umask|chmod|chown|droits|permission/i, key: /dump\.rdb: Permission denied/ },
  'p6-wget-503-auth':            { mech: /authentif|connect(é|e) dans|session|login|public|accès restreint|authenticat|identifi/i, act: /authentif|public|identifiants|credentials|session|cookie|accès/i, key: /503/ },
  'p6-logrotate-create-perms':   { mech: /logrotate|rotation|\bcreate\b|recréé|propriétaire|owner/i, act: /create\s+0?6\d\d|\bcreate\b|chown|propriétaire|owner|logrotate/i, key: /open error: Permission denied/ },
  'p6-php-unlink-cwd':           { mech: /dossier courant|répertoire courant|current dir|working dir|\bcwd\b|relatif|relative|chemin absolu|depuis le dossier/i, act: /chemin absolu|absolute|__DIR__|chdir|\bcd\b|dirname/i, key: /unlink\(test\.zip\)/ },
  'p6-meteor-fiber':             { mech: /fiber|bindEnvironment|environnement meteor|meteor environment|hors du contexte|outside/i, act: /bindEnvironment|fiber/i, key: /without a fiber/ },
  'p6-date-unquoted-format':     { mech: /guillemets|quot|non (cité|protégé)|espaces?|argument|séparé|split/i, act: /guillemets|quot|"\+%b/i, key: /date \+%b/ },
  'p6-sphinx-path':              { mech: /\bpath\b|\/usr\/local\/bin|profile|environnement|environment/i, act: /\bpath\b|\/usr\/local\/bin|chemin absolu|bin_path/i, key: /Sphinx cannot be found/ },
  'p6-sudo-root-module':         { mech: /\broot\b|autre utilisateur|\bsudo\b|utilisateur|\buser\b/i, act: /crontab -e|sans sudo|utilisateur|\broot\b|pip/i, key: /No module named bs4/ },
  'p6-selenium-firefox-version': { mech: /version|mise à jour|update|incompatib|upgrade/i, act: /version|hold|apt-mark|mettre à jour|upgrade|downgrade|épingl|pin/i, key: /Can't load the profile/ },
  'p6-mysql-2002-disk-full':     { mech: /disque|\bdisk\b|espace|space|error (number )?28|errno 28/i, act: /\bdf\b|espace|space|disque|\bdisk\b|libérer|free/i, key: /ERROR 2002|Can't connect to local MySQL server/ },

  // ── Public7 (TEST, requêtes figées avant la précision des fiches, gelé brut cc9e6ff ; étiquettes écrites avant tout run) ──
  'p7-quartz-job-already-stored': { mech: /d[ée]j[aà] (enregistr|pr[ée]sent|stock)|already exists|persist|job ?store|base (de|des) (jobs|t[aâ]ches)/i, act: /vider|supprim|wipe|remplac|replace|v[ée]rifier.{0,40}exist|existe d[ée]j[aà]/i, key: /ObjectAlreadyExistsException/ },
  'p7-php-killed-oom':            { mech: /m[ée]moire|memory|\boom\b/i, act: /dmesg|m[ée]moire|memory|limite/i, key: /^Killed$/m },
  'p7-node-heap-parallel':        { mech: /parall|simultan|concurren|await|en m[eê]me temps|lots|batch/i, act: /await|s[ée]quentiel|lots|batch|un par un|parall/i, key: /heap out of memory/ },
  'p7-cron-mail-postfix-domain':  { mech: /postfix|mydestination|domaine|nom d'h[oô]te|hostname|lui-m[eê]me|local/i, act: /mydestination|postfix|main\.cf/i, key: /postfix\/smtp/ },
  'p7-docker-cron-not-installed': { mech: /pas install|non install|absent|not installed|paquet|package|image/i, act: /apt-get.{0,30}install.{0,20}cron|install(er)? (le paquet )?cron/i, key: /crontab: not found/ },
  'p7-conda-activate-bashrc':     { mech: /bashrc|bash_profile|conda|profil|shell de connexion|\blogin\b|environnement/i, act: /conda activate|\s-l\b|bashrc|source|chemin absolu|python d(u|e l')/i, key: /activate: No such file/ },
  'p7-crontab-and-chained-line':  { mech: /&&|ligne s[ée]par|m[eê]me ligne|ligne (de )?crontab|fr[ée]quence|syntaxe (de )?crontab|commande suivante/i, act: /ligne s[ée]par|separate line|nouvelle ligne|&&/i, key: /\*\/5: not found/ },
  'p7-k8s-busybox-no-kubectl':    { mech: /kubectl.{0,50}(absent|install|introuvable|n'est pas|pas dans)|busybox|image/i, act: /bitnami|image.{0,40}kubectl|kubectl.{0,40}image|install(er)? kubectl/i, key: /Exit Code:\s+127/ },
  'p7-php-relative-backup-dir':   { mech: /relati|absolu|dossier courant|r[ée]pertoire (courant|de base)|base directory/i, act: /absolu|absolute|chdir|\bcd\b/i, key: /No such file or directory/ },
  'p7-readonly-fs-errors':        { mech: /disque|\bdisk\b|secteur|media error|erreurs? (de lecture|du disque|mat[ée]rielle)|fsck|corromp|syst[eè]me de fichiers|mat[ée]riel/i, act: /fsck/i, key: /media error|error: \{ UNC \}/ },
  'p7-bad-interpreter-not-exec':  { mech: /ex[ée]cutable|droit|chmod|permission|interpr[ée]teur/i, act: /chmod|ex[ée]cutable|droit/i, key: /bad interpreter/ },
  'p7-crontab-pasted-in-bash':    { mech: /bash|crontab -e|pas une commande|ligne de crontab|planification|syntaxe (de )?crontab|coll[ée]e?/i, act: /crontab -e/i, key: /\*\/10/ },

  // ── Public8 (TEST, moitié non lue pendant le réglage du 2026-11-13 ; étiquettes écrites avant le run)
  'p8-mysqldump-invalid-view':    { mech: /\bvue\b|\bview\b|definer|r[ée]f[ée]renc|table supprim|invalide/i, act: /--force|drop view|supprimer la vue|recr[ée]er la vue|corriger la vue/i, key: /1356/ },
  'p8-python-relative-tar':       { mech: /dossier courant|r[ée]pertoire courant|relati|working directory|cwd/i, act: /absolu|chdir|\bcd\b/i, key: /Errno 2/ },
  'p8-scrapy-venv-cron':          { mech: /virtualenv|venv|environnement virtuel|autre interpr[ée]teur|autre version de python|autre python/i, act: /activate|venv\/bin\/python|bin\/python|chemin complet de l'interpr[ée]teur/i, key: /ImportError/ },
  'p8-magento-php-run-by-sh':     { mech: /(ex[ée]cut|lanc|interpr[ée]t)\w* (par|avec|comme) (un script )?(bash|sh|shell)|pas (par|avec) php|sans php|PHP_BIN/i, act: /PHP_BIN|\/usr\/bin\/php|\bphp \/|avec php|par php/i, key: /\?php: No such file/ },
  'p8-pm2-home-env':              { mech: /PM2_HOME|autre (d[ée]mon|instance)|variable d'environnement|environnement de (la session|votre shell)/i, act: /PM2_HOME/i, key: /Process 4 not found/ },
  'p8-selenium-no-display':       { mech: /affichage|display|xvfb|X11|graphique|headless/i, act: /xvfb|headless|DISPLAY/i, key: /stable firefox connection/ },
  'p8-wget-not-installed':        { mech: /pas install|non install|n'est pas install|absent du syst[eè]me|not installed/i, act: /(apt-get|apt|yum|dnf) install wget|install\w* wget|\bcurl\b/i, key: /wget command not found/ },
  'p8-python-not-in-path':        { mech: /\bPATH\b/i, act: /chemin (complet|absolu)|\/usr\/bin\/python|PATH=/i, key: /python: command not found/ },
  'p8-laravel-cron-six-fields':   { mech: /6 champs|six champs|5 champs|cinq champs|sixi[eè]me|nombre de champs|champ en trop/i, act: /\* \* \* \* \*|everyMinute|5 champs|cinq champs|retirer/i, key: /is not a valid position/ },
  'p8-perl-inc-env-var':          { mech: /@INC|PERL5LIB|variable d'environnement|use lib|CARSPATH/i, act: /PERL5LIB|CARSPATH|use lib|d[ée]finir.{0,40}variable|variable.{0,40}crontab/i, key: /Can't locate/ },
  'p8-r-here-working-dir':        { mech: /dossier courant|r[ée]pertoire courant|working directory|relati|here\(\)|dossier de lancement/i, act: /chemin (du script|absolu)|dirname|absolu|setwd|--file|\bcd\b/i, key: /does not exist/ },

  // ── Public4 (TEST, collecté avant les leviers contexte d'exécution / vérification de commande) ──
  'p4-python-version-cron':     { mech: /version|python ?2|interpréteur|ancien python|autre python/i, act: /python ?2\.7|python3|shebang|chemin|version/i, key: /SyntaxError/ },
  'p4-laravel-mail-template':   { mech: /template|\bvue\b|\bview\b|welcome/i, act: /emails\.welcome|template|\bvue\b|\bview\b/i, key: /Undefined variable: errors/ },
  'p4-python3-import':          { mech: /python ?3|version|interpréteur|python 2/i, act: /python3|chemin|interpréteur|shebang/i, key: /No module named/ },
  'p4-shebang-hidden-chars':    { mech: /caractères? (invisibles?|cachés?|parasites?)|\bbom\b|crlf|encodage|\\r|fins? de ligne/i, act: /recréer|dos2unix|retaper|réécrire|\bbom\b|encodage|fins? de ligne/i, key: /#!\/bin\/bash: No such file/ },
  'p4-rsync-process-subst-sh':  { mech: /\bsh\b|\bdash\b|substitution|<\(/i, act: /\bbash\b|retirer sh|sans sh/i, key: /failed to open files-from/ },
  'p4-git-ssh-agent':           { mech: /ssh_auth_sock|\bagent\b|session/i, act: /clé|ssh-keygen|sans (mot de passe|passphrase)|keychain|ssh_auth_sock|-i\b/i, key: /Could not read from remote repository/ },
  'p4-npm-path':                { mech: /\bpath\b|\.bashrc|chemin/i, act: /\bpath\b|which|chemin (complet|absolu)/i, key: /command not found/ },
  'p4-java-path':               { mech: /\bpath\b|chemin/i, act: /\bpath\b|chemin (complet|absolu)|\/usr\/bin\/java|which/i, key: /java: not found/ },
  'p4-gsutil-path':             { mech: /\bpath\b|chemin/i, act: /chemin (complet|absolu)|\/usr\/local\/bin|\bpath\b/i, key: /gsutil: not found/ },
  'p4-date-percent':            { mech: /%|pourcent|percent/i, act: /\\%|%|échapp/i, key: /unexpected EOF/ },
  'p4-crontab-backquote':       { mech: /backquotes?|backticks?|`|%|accents? graves?/i, act: /\$\(|%|échapp/i, key: /bad ` sign/ },
  'p4-php-relative-require':    { mech: /chemin relatif|relatif|dossier (courant|de travail)|répertoire (courant|de travail)|\bcwd\b/i, act: /chemin (complet|absolu)|__DIR__|dirname|set_include_path|\bcd\b/i, key: /Failed opening required/ },
  'p4-pgpassword-quotes':       { mech: /caractères? spéciaux|guillemets?|quot|échapp|\$/i, act: /guillemets simples|apostrophes|single quotes|échapp|'/i, key: /password authentication failed/ },
  'p4-bundle-path-environment': { mech: /\bpath\b|\/etc\/environment|bash_profile|environnement/i, act: /\/etc\/environment|bash_profile|\bpath\b|chemin/i, key: /bundle: command not found/ },
  'p4-sh-run-by-python':        { mech: /python|interpréteur|shebang/i, act: /\bbash\b|\bsh\b|shebang|#!\/bin\/(ba)?sh/i, key: /SyntaxError: invalid syntax/ },
  'p4-cron-no-user-var':        { mech: /\buser\b|variable (absente|non définie)|environnement (minimal|réduit)|logname/i, act: /logname|\buser\b|définir|crontab/i, key: /env\(USER\)/ },
  'p4-display-xauthority':      { mech: /variable display|display (non|n'est pas|absente|vide)|xauthority|session (graphique|x)/i, act: /display|xauthority|export/i, key: /could not open display/ },

  'p3-notify-send-display':         { mech: /variable display|display (non|n'est pas|absente|vide)|xauthority|dbus_session|session (graphique|x)/i, act: /display|xauthority|export|dbus/i, key: /could not open display/ },
}

// Actions qui aggravent ou masquent la panne : 0 point d'action, même si la regex ACT passe.
export const FORBIDDEN = /rm\s+-rf\s+\/|drop\s+(table|database)|truncate\s+table|chmod\s+777|verify\s*=\s*false|NODE_TLS_REJECT_UNAUTHORIZED|--insecure|curl\s+-k\b|désactiv\w*\s+(la\s+)?(vérification|ssl|tls)|disable\w*\s+(ssl|tls|verification)/i
const ABSTAIN   = /non établi|inconnu|indéterminé|pas assez|impossible de déterminer|unknown|undetermined|cannot determine/i

export interface Grade { total: number; mech: number; act: number; cat: number; noInvent: number; evidence: number; honesty: number; why: string[] }

export function grade(caseName: string, expectedCategory: string, logs: string, res: AnalysisResult | null): Grade {
  const L = LABELS[caseName]
  if (!L) throw new Error(`Pas d'étiquette pour ${caseName} (eval/rubric.ts)`)
  const why: string[] = []
  if (!res) return { total: 0, mech: 0, act: 0, cat: 0, noInvent: 0, evidence: 0, honesty: 0, why: ['réponse absente ou non parsable'] }

  const mech = L.mech.test(res.cause) ? 4 : 0
  if (!mech) why.push('cause : symptôme ou mauvaise cause')
  // Une consigne négative (« ne pas désactiver la vérification TLS ») n'est pas une action dangereuse :
  // on retire les phrases niées avant le test (bug de grille corrigé le 2026-11-08, 6 faux positifs).
  const NEGATED = /(ne\s+(pas|jamais)|jamais|never|don'?t|do not)\s+[^.;]*/gi
  const dangerous = FORBIDDEN.test(`${res.action} ${res.checks.join(' ')}`.replace(NEGATED, ''))
  const act = L.act.test(res.action) && !dangerous ? 3 : 0
  if (dangerous) why.push('action dangereuse')
  else if (!act) why.push('action hors sujet')
  const cat = res.category === expectedCategory ? 1 : 0
  if (!cat) why.push(`catégorie ${res.category} ≠ ${expectedCategory}`)
  // Le texte recopié d'une fiche connue (relue, livrée avec CronGuard) n'est pas une invention du
  // modèle : seul le texte généré est contrôlé.
  const kf = res.knownFix
  const fromFix = new Set(kf ? [kf.cause, kf.action, ...kf.steps] : [])
  // Idem pour les commandes de test construites par le code (diagnosticChecks : reproduction dans l'environnement
  // du cron, écarts constatés) : elles reprennent la commande du job et des faits relevés, pas une invention.
  // Corrigé le 2026-11-10 avant public7 (biais vu sur public6 : −1 sur 7 cas sur 15).
  // « Piste (…) : » ajouté le 2026-11-13 : vérifications par type d'erreur (error-shape.ts), gabarits du code + objet du log.
  const builtByCode = /^(Reproduire avec l'environnement du cron|Variables présentes dans votre shell|PATH de votre shell|Relancer le job à la main sous l'utilisateur du cron|Piste \()/
  const generated = [res.cause, res.action, ...res.checks].filter(x => !fromFix.has(x) && !builtByCode.test(x)).join(' ')
  const invented = unverifiableIdentifiers(generated, logs)
  const noInvent = invented.length ? 0 : 1
  if (invented.length) why.push(`inventé : ${invented.slice(0, 3).join(', ')}`)
  const evidence = evidenceLines(logs, res.cause).some(l => L.key.test(l)) ? 1 : 0
  if (!evidence) why.push('preuve : ligne décisive non liée')
  let honesty = 0
  if (!mech && res.confidence === 'low' && ABSTAIN.test(res.cause)) { honesty = 1; why.push('abstention honnête (+1)') }
  if (!mech && res.confidence === 'high') { honesty = -1; why.push('fausse cause sûre d\'elle (−1)') }
  const total = Math.max(0, Math.min(10, mech + act + cat + noInvent + evidence + honesty))
  return { total, mech, act, cat, noInvent, evidence, honesty, why }
}
