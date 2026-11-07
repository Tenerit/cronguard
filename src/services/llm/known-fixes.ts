// Corrections connues pour des pannes courantes, livrées avec CronGuard : la mémoire des
// corrections est vide au premier jour, celles-ci servent dès la première panne.
//
// Déclenchées par le TEXTE des logs (regex précise), jamais par le modèle. Ce sont des
// étapes de diagnostic standard, pas une correction vérifiée chez le client : l'interface
// les présente comme « correction connue, à adapter ». Ordre = priorité (le plus précis
// d'abord : WAL plein avant disque plein, inodes avant disque plein).
//
// N'ajouter qu'une panne au message stable et une procédure qu'un ops validerait sans
// contexte. Chaque entrée a un test qui la déclenche et des fixtures qui ne doivent pas.

import type { ErrorCategory } from './analyzer'

export interface KnownFix {
  id:    string
  category: ErrorCategory
  title: string
  steps: string[]
}

const FIXES: Array<KnownFix & { match: RegExp }> = [
  {
    id: 'pg-wal-full',
    category: 'database',
    match: /pg_wal\/\S*["']?:? No space left on device|could not write to file "pg_wal/i,
    title: 'PostgreSQL : disque plein dans pg_wal',
    steps: [
      'Ne pas supprimer de fichiers dans pg_wal à la main (corruption).',
      "Slot de réplication inactif qui retient le WAL : SELECT slot_name, active, restart_lsn FROM pg_replication_slots;",
      "Archivage en échec : SELECT failed_count, last_failed_wal FROM pg_stat_archiver;",
      'Libérer ou agrandir le volume, puis supprimer le slot abandonné : SELECT pg_drop_replication_slot(\'nom\');',
    ],
  },
  {
    id: 'inodes-exhausted',
    category: 'resources',
    match: /inodes? (exhausted|épuisés)|no free inodes|out of inodes/i,
    title: 'Inodes épuisés (disque pas forcément plein)',
    steps: [
      'Confirmer : df -i (IUse% à 100 %) alors que df -h montre de la place.',
      'Trouver les dossiers aux millions de petits fichiers : du --inodes -x / 2>/dev/null | sort -n | tail',
      'Purger ou archiver ces fichiers (cache, sessions, extractions temporaires), ou regrouper en archive.',
    ],
  },
  {
    id: 'disk-full',
    category: 'resources',
    match: /No space left on device|ENOSPC/i,
    title: 'Disque plein',
    steps: [
      'Voir le volume plein : df -h',
      'Trouver ce qui occupe : du -xh <point_de_montage> 2>/dev/null | sort -h | tail -20',
      'Purger les anciens fichiers (sauvegardes, logs) ; journaux systemd : journalctl --vacuum-size=500M',
      'Ajouter une rétention au job pour que la panne ne revienne pas.',
    ],
  },
  {
    id: 'oom-killed',
    category: 'resources',
    match: /Out of memory: Killed process|OOMKilled|oom-kill|exit code:? 137\b/i,
    title: 'Processus tué par manque de mémoire (OOM, code 137)',
    steps: [
      'Confirmer : dmesg -T | grep -i -E "out of memory|killed process"',
      'Réduire la mémoire par exécution (traitement par lots, streaming au lieu de tout charger).',
      'Ou augmenter la limite mémoire du conteneur / de la machine, puis surveiller le pic.',
    ],
  },
  {
    id: 'pg-connection-refused',
    category: 'database',
    match: /port 5432 failed: Connection refused|could not connect to server: Connection refused/i,
    title: 'PostgreSQL injoignable (connexion refusée)',
    steps: [
      'Le serveur répond-il ? pg_isready -h <hôte> -p 5432',
      'Service arrêté ? systemctl status postgresql (ou docker ps pour un conteneur)',
      'Écoute sur la bonne interface : listen_addresses (postgresql.conf) et règles pg_hba.conf.',
    ],
  },
  {
    id: 'pg-too-many-connections',
    category: 'database',
    match: /too many clients already|remaining connection slots are reserved/i,
    title: 'PostgreSQL : plus de connexions disponibles',
    steps: [
      'Qui tient les connexions : SELECT usename, application_name, state, count(*) FROM pg_stat_activity GROUP BY 1,2,3 ORDER BY 4 DESC;',
      "Connexions oubliées : état 'idle in transaction' ; régler idle_in_transaction_session_timeout.",
      "Mettre un pooler (PgBouncer) plutôt qu'augmenter max_connections.",
    ],
  },
  {
    id: 'db-deadlock',
    category: 'database',
    match: /deadlock detected|Deadlock found when trying to get lock/i,
    title: 'Interblocage (deadlock) entre transactions',
    steps: [
      'Relancer la transaction : un deadlock est transitoire, la base en a annulé une.',
      'Prendre les verrous dans le même ordre partout (trier les ids avant les UPDATE).',
      'Raccourcir les transactions ; découper les gros lots.',
    ],
  },
  {
    id: 'dns-resolution',
    category: 'network',
    match: /Could not resolve host|getaddrinfo (ENOTFOUND|EAI_AGAIN)|Temporary failure in name resolution|Name or service not known/i,
    title: 'Résolution DNS en échec',
    steps: [
      'Tester depuis la machine du job : getent hosts <nom> (ou dig <nom>)',
      'Vérifier le résolveur : cat /etc/resolv.conf',
      'Nom mal orthographié ou enregistrement supprimé côté fournisseur ?',
    ],
  },
  {
    id: 'tls-cert-expired',
    category: 'network',
    match: /certificate has expired|CERT_HAS_EXPIRED|certificate verify failed: certificate has expired/i,
    title: 'Certificat TLS expiré',
    steps: [
      "Voir la date d'expiration : echo | openssl s_client -connect <hôte>:443 -servername <hôte> 2>/dev/null | openssl x509 -noout -enddate",
      "Si c'est votre certificat Let's Encrypt : certbot renew --dry-run, puis vérifier le timer (systemctl list-timers | grep certbot).",
      "Si c'est celui d'un tiers : le prévenir ; ne pas désactiver la vérification TLS.",
    ],
  },
  {
    id: 'http-429',
    category: 'dependency',
    match: /\b429\b.*(Too Many Requests|rate limit)|(Too Many Requests|rate limit exceeded).*\b429\b|RateLimitError/i,
    title: 'Limite de débit de l\'API atteinte (429)',
    steps: [
      'Respecter l\'en-tête Retry-After et réessayer avec un délai exponentiel.',
      'Étaler les appels (moins de parallélisme, lots plus petits).',
      'Vérifier qu\'un autre job n\'utilise pas la même clé au même moment.',
    ],
  },

  // ── Pannes courantes des jobs planifiés (sauvegardes, ETL, synchronisations) ──
  // Regex écrites d'après les messages standard des outils (PostgreSQL, MySQL, OpenSSL/Go,
  // AWS, Node, rsync, tar, OpenSSH, Python), pas d'après un log précis.
  {
    id: 'pg-dump-version-mismatch',
    category: 'database',
    match: /pg_dump: (error: )?aborting because of server version mismatch/i,
    title: 'pg_dump plus ancien que le serveur PostgreSQL',
    steps: [
      'pg_dump doit être au moins de la version majeure du serveur (voir « server version » et « pg_dump version » dans le log).',
      "Vérifier quel pg_dump le cron utilise : son PATH est minimal, ce n'est souvent pas celui de votre shell.",
      'Appeler le bon binaire en chemin absolu (ex. /usr/lib/postgresql/<version>/bin/pg_dump) ou installer postgresql-client de la bonne version.',
    ],
  },
  {
    id: 'pg-auth-failed',
    category: 'database',
    match: /password authentication failed for user|no pg_hba\.conf entry for host|fe_sendauth: no password supplied/i,
    title: 'PostgreSQL refuse l\'authentification',
    steps: [
      "Le cron tourne sous un autre utilisateur : son ~/.pgpass existe-t-il, en chmod 600 ? (ou PGPASSFILE)",
      'Mot de passe changé ou rotation récente du secret ?',
      "« no pg_hba.conf entry » : ajouter une règle pour l'hôte/utilisateur/base dans pg_hba.conf, puis SELECT pg_reload_conf();",
    ],
  },
  {
    id: 'mysql-lock-tables',
    category: 'database',
    match: /Access denied for user .* when using LOCK TABLES/i,
    title: 'mysqldump : droit LOCK TABLES manquant',
    steps: [
      "Tables InnoDB : ajouter --single-transaction (sauvegarde cohérente sans verrouiller).",
      "Sinon accorder le droit : GRANT LOCK TABLES ON <base>.* TO '<user>'@'<hôte>';",
      'Vérifier avec SHOW GRANTS FOR \'<user>\'@\'<hôte>\'; que le compte du cron est bien celui attendu.',
    ],
  },
  {
    id: 'mysql-access-denied',
    category: 'database',
    match: /ERROR 1045 \(28000\)|Got error: 1045|Access denied for user '[^']*'@'[^']*' \(using password/i,
    title: 'MySQL refuse l\'authentification',
    steps: [
      "Le cron tourne sous un autre utilisateur : son fichier d'options (~/.my.cnf, --defaults-extra-file) est-il lisible et à jour ?",
      'Mot de passe changé, ou compte limité à un autre hôte (\'user\'@\'localhost\' ≠ \'user\'@\'%\') ?',
    ],
  },
  {
    id: 'command-not-found',
    category: 'dependency',
    match: /(^|\s)(\/bin\/)?(ba|da)?sh: (line \d+: |\d+: )?[\w.\/-]+: (command )?not found/m,
    title: 'Commande introuvable (PATH minimal du cron)',
    steps: [
      "cron démarre avec un PATH réduit (souvent /usr/bin:/bin) : un outil sous /usr/local/bin, nvm ou pyenv y est invisible.",
      'Appeler la commande en chemin absolu (command -v <outil> pour le trouver), ou définir PATH= en tête de la crontab.',
    ],
  },
  {
    id: 'python-module-missing',
    category: 'dependency',
    match: /ModuleNotFoundError: No module named/,
    title: 'Module Python introuvable (mauvais environnement)',
    steps: [
      "Le cron n'active pas le virtualenv : appeler le python du venv en chemin absolu (/chemin/venv/bin/python script.py).",
      'Vérifier que la dépendance est installée dans CE venv (pip install … avec ce python).',
    ],
  },
  {
    id: 'tls-unknown-ca',
    category: 'network',
    match: /certificate signed by unknown authority|unable to get local issuer certificate|self[- ]signed certificate in certificate chain|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN/i,
    title: 'Certificat émis par une autorité inconnue (CA interne non approuvée)',
    steps: [
      "Ajouter la CA interne au magasin système (update-ca-certificates / update-ca-trust) sur la machine ou dans l'image du job.",
      'Ou la donner à l\'outil : SSL_CERT_FILE, REQUESTS_CA_BUNDLE (Python), NODE_EXTRA_CA_CERTS (Node), --cacert.',
      'Ne pas désactiver la vérification TLS.',
    ],
  },
  {
    id: 'tls-hostname-mismatch',
    category: 'network',
    match: /legacy Common Name field|certificate is not valid for any names|Hostname mismatch|doesn't match any of the subject alternative names|ERR_TLS_CERT_ALTNAME_INVALID/i,
    title: 'Certificat qui ne couvre pas ce nom d\'hôte (SAN)',
    steps: [
      'Le nom appelé doit figurer dans les Subject Alternative Names du certificat (le Common Name seul ne suffit plus).',
      "Régénérer le certificat avec les SAN corrects, ou appeler l'hôte par un nom qu'il couvre.",
    ],
  },
  {
    id: 'cloud-token-expired',
    category: 'dependency',
    match: /ExpiredToken|security token included in the request is expired|SSO session associated with this profile has expired/i,
    title: 'Identifiants cloud temporaires expirés',
    steps: [
      "Le cron utilise des identifiants de session (SSO, assume-role) d'un shell interactif : ils expirent.",
      "Donner au job ses propres identifiants : rôle d'instance / IRSA, ou un compte de service limité.",
      'Job plus long que la durée du jeton : rafraîchir les identifiants en cours de route ou allonger la durée de session.',
    ],
  },
  {
    id: 'node-heap-oom',
    category: 'resources',
    match: /JavaScript heap out of memory|Reached heap limit Allocation failed/i,
    title: 'Node.js : limite de mémoire du tas atteinte',
    steps: [
      'Augmenter la limite : NODE_OPTIONS=--max-old-space-size=<Mo> (sans dépasser la RAM disponible).',
      'Traiter par lots ou en flux au lieu de tout charger en mémoire.',
    ],
  },
  {
    id: 'acme-challenge-timeout',
    category: 'network',
    match: /Timeout during connect \(likely firewall problem\)/i,
    title: 'Let\'s Encrypt ne joint pas le serveur (port 80)',
    steps: [
      "Le port 80 doit être joignable depuis Internet : pare-feu du serveur, groupe de sécurité, box ou FAI.",
      "Les enregistrements DNS A et AAAA doivent pointer vers CE serveur (un AAAA périmé suffit à faire échouer).",
      'Tester : certbot renew --dry-run',
    ],
  },
  {
    id: 'rsync-partial-transfer',
    category: 'data',
    match: /rsync error: some files\/attrs were not transferred.*\(code 23\)/i,
    title: 'rsync : transfert partiel (code 23)',
    steps: [
      'Chercher les lignes « Permission denied » juste au-dessus : fichiers illisibles ou destination non inscriptible.',
      'Relancer à la main sous le même utilisateur que le cron (sudo -u <user> rsync …) pour reproduire.',
      'Exclure les fichiers inutiles plutôt que d\'ignorer le code 23 : la sauvegarde serait incomplète en silence.',
    ],
  },
  {
    id: 'tar-file-changed',
    category: 'data',
    match: /file changed as we read it/i,
    title: 'tar : fichier modifié pendant la sauvegarde',
    steps: [
      'Sauvegarder un instantané (LVM, ZFS, snapshot cloud) ou arrêter l\'écriture pendant l\'archive.',
      'Pour une base de données, utiliser son outil de dump plutôt que tar sur les fichiers.',
    ],
  },
  {
    id: 'ssh-publickey-denied',
    category: 'network',
    match: /Permission denied \(publickey/i,
    title: 'SSH refuse la clé (publickey)',
    steps: [
      "Le cron n'a pas d'agent SSH : préciser la clé (ssh -i <clé> ou IdentityFile dans ~/.ssh/config de l'utilisateur du cron).",
      'Droits de la clé : chmod 600 ; clé publique bien présente dans authorized_keys du compte distant.',
    ],
  },
  {
    id: 'too-many-open-files',
    category: 'resources',
    match: /Too many open files|EMFILE/,
    title: 'Trop de fichiers ouverts',
    steps: [
      'Voir la limite : ulimit -n (et LimitNOFILE= pour un service systemd).',
      "Chercher une fuite de descripteurs (fichiers ou connexions jamais fermés) avant d'augmenter la limite.",
    ],
  },
]

export function knownFix(logs: string): KnownFix | null {
  if (!logs) return null
  const f = FIXES.find(x => x.match.test(logs))
  return f ? { id: f.id, category: f.category, title: f.title, steps: f.steps } : null
}
