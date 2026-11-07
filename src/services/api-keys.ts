import { createHash, randomBytes } from 'crypto'

// Les clés API ne sont stockées qu'en empreinte : une fuite de la base (dump, sauvegarde)
// ne donne accès à aucun compte. La clé en clair n'existe qu'au moment où on la crée.
// SHA-256 sans sel suffit ici : 128 bits aléatoires, rien à deviner par dictionnaire.

export function newApiKey(): string {
  return 'cg_live_' + randomBytes(16).toString('hex')
}

export function hashApiKey(key: string): string {
  return 'sha256:' + createHash('sha256').update(key).digest('hex')
}
