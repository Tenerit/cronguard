/**
 * Mesure ce qu'on vend : la cause et l'action, pas seulement l'étiquette.
 *
 * FACTS : pour chaque fixture, ce qu'une cause et une action utiles doivent évoquer. Écrit sans
 * regarder les sorties du modèle. C'est un filtre lâche par mots-clés (FR/EN) : le rater est un
 * mauvais signe, le passer ne prouve pas que l'action est bonne.
 *
 * unverifiableIdentifiers : paramètres, options et chemins cités absents des logs. Ils ne sont pas
 * forcément faux (max_connections peut être légitime), mais l'opérateur ne peut pas s'y fier sans
 * vérifier. Sert à repérer les inventions comme « max_write_size ».
 */
export const FACTS: Record<string, { cause: RegExp; action: RegExp }> = {
  'pg-connection-refused':          { cause: /refus|5432|db-primary/i, action: /postgres|serveur|server|db-primary|service|pg_isready|systemctl/i },
  'pg-too-many-connections':        { cause: /max_connections|too many|trop de|connexions|slots/i, action: /max_connections|pool|pgbouncer|connexions/i },
  'mysql-deadlock':                 { cause: /deadlock|interblocage|1213/i, action: /retry|relanc|réessay|batch|lot|transaction|verrou|lock|ordre/i },
  'pg-disk-full-wal':               { cause: /no space|espace|disque|100\s*%|pg_wal/i, action: /libér|espace|disque|wal|purge|nettoy|étendre|augmenter|clean/i },
  'dns-resolution-failure':         { cause: /resolve|résou|dns|enotfound|partner-feeds/i, action: /dns|resolv|nameserver|10\.0\.0\.2/i },
  'tls-cert-expired':               { cause: /cert|expir/i, action: /renouvel|cert|renew/i },
  'econnreset-mid-transfer':        { cause: /econnreset|reset|réinitialis|interromp/i, action: /retry|relanc|réessay|renvoy|retransf|reprendre/i },
  'route-unreachable-vpn':          { cause: /vpn|ehostunreach|unreachable|injoignable|10\.50|tunnel/i, action: /vpn|tunnel/i },
  'watchdog-sigkill':               { cause: /3600|3630|sigkill|sigterm|limite|timeout|dépass|exceed/i, action: /limit|timeout|augment|optimis|découp|chunk|parallél|segment/i },
  'http-client-timeout':            { cause: /timed? ?out|\b28\b|30000|rates\.vendor|délai/i, action: /vendor|rates|retry|réessay|relanc|timeout|fournisseur|disponib/i },
  'query-statement-timeout':        { cause: /statement.?timeout|120|expir|délai/i, action: /statement_timeout|index|partition|optimis|augment/i },
  'oom-killer-137':                 { cause: /oom|out of memory|mémoire|137|16gi/i, action: /mémoire|memory|limit|chunk|lot|batch|16gi/i },
  'disk-full-enospc':               { cause: /no space|espace|enospc|disque|100\s*%/i, action: /rotation|purg|supprim|nettoy|archive|libér|delete/i },
  'fork-cannot-allocate':           { cause: /cannot allocate|mémoire|memory|fork/i, action: /mémoire|memory|worker|réduire|\bram\b|parallél/i },
  'inode-exhaustion':               { cause: /inode/i, action: /inode|fichiers|petits|files|supprim|nettoy|mkfs/i },
  'stripe-rate-limit-429':          { cause: /429|rate limit|limite de débit|quota|\btaux\b/i, action: /retry-after|attendre|backoff|retry|réessay|relanc|ralenti|réduire/i },
  'api-key-revoked-401':            { cause: /401|revoked|révoqu|\bclé|\bkey|sec-2291|rotat/i, action: /\bclé|\bkey|sendgrid|renouvel|mettre à jour|rotat/i },
  'vendor-maintenance-503':         { cause: /503|maintenance/i, action: /06:00|attendre|retry|relanc|réessay|maintenance/i },
  'geocoding-quota-exceeded':       { cause: /quota|403|resource_exhausted/i, action: /quota|minuit|midnight|augment|attendre/i },
  'typeerror-undefined-prop':       { cause: /tier|undefined|bonus/i, action: /tier|bonus\.js|computebonus|null/i },
  'python-keyerror':                { cause: /gross_amount|keyerror/i, action: /gross_amount|colonne|column|mapping|csv/i },
  'syntax-error-bad-deploy':        { cause: /syntax|rotate-logs|unexpected|f3c2a91|8841/i, action: /f3c2a91|revert|rollback|annul|retour|corrig|\bfix|rotate-logs/i },
  'unhandled-rejection-null-order': { cause: /null|order|items|destructure/i, action: /null|order|cart\.js|vérif|garde|check/i },
  'validation-null-ids':            { cause: /null|customer_id|quality|qualité|91\.2|99\.5|quarantin/i, action: /source|batch|\blot\b|customer_id|amont|fournisseur|producteur|corrig|vérif/i },
  'csv-encoding-garbage':           { cause: /utf-?16|encod|0xff|\bbom\b/i, action: /utf-?8|encod|convert|iconv|fournisseur|supplier/i },
  'schema-drift-extra-column':      { cause: /consent_flags|schéma|schema|colonne|column|mismatch/i, action: /consent_flags|alter|colonne|column|ajout|\badd\b|schéma|schema/i },
}

const IDENTIFIER = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|--[a-z][a-z-]+|(?:\/[\w.-]+){2,}|\b[\w-]+\.(?:conf|ya?ml|json|ini|sh|py|js|toml)\b/gi

export function unverifiableIdentifiers(text: string, logs: string): string[] {
  const known = logs.toLowerCase()
  return [...new Set((text.match(IDENTIFIER) ?? []).map(id => id.toLowerCase()))].filter(id => !known.includes(id))
}

// Score d'une réponse constante égale à l'étiquette la plus fréquente : ce qu'un modèle doit dépasser.
export function constantBaseline(labels: string[]): { label: string; rate: number } {
  const counts = new Map<string, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  const [label, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { label, rate: n / labels.length }
}
