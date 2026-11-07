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
]

export function knownFix(logs: string): KnownFix | null {
  if (!logs) return null
  const f = FIXES.find(x => x.match.test(logs))
  return f ? { id: f.id, category: f.category, title: f.title, steps: f.steps } : null
}
