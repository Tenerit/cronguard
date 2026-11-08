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
  const dangerous = FORBIDDEN.test(`${res.action} ${res.checks.join(' ')}`)
  const act = L.act.test(res.action) && !dangerous ? 3 : 0
  if (dangerous) why.push('action dangereuse')
  else if (!act) why.push('action hors sujet')
  const cat = res.category === expectedCategory ? 1 : 0
  if (!cat) why.push(`catégorie ${res.category} ≠ ${expectedCategory}`)
  // Le texte recopié d'une fiche connue (relue, livrée avec CronGuard) n'est pas une invention du
  // modèle : seul le texte généré est contrôlé.
  const kf = res.knownFix
  const fromFix = new Set(kf ? [kf.cause, kf.action, ...kf.steps] : [])
  const generated = [res.cause, res.action, ...res.checks].filter(x => !fromFix.has(x)).join(' ')
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
