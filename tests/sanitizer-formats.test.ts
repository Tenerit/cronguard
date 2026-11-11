import { describe, it, expect } from 'vitest'
import { sanitizeLogs } from '../src/services/sanitizer'

// Valeurs assemblées à l'exécution : aucun jeton au format réel écrit dans le dépôt.
const tok = (prefix: string, n: number) => prefix + 'Ab3'.repeat(Math.ceil(n / 3)).slice(0, n)

describe('masquage — secrets par format connu', () => {
  it.each([
    [`git clone https://${tok('gh' + 'p_', 36)}@github.com/acme/app.git`, tok('gh' + 'p_', 36)],
    ['MongoServerSelectionError: mongodb+srv://app:Zx9-Qw8!pL@cluster0.mongodb.net/prod', 'Zx9-Qw8!pL'],
    ['+ docker login -u ci -p Hk2_mN7qR4 registry.acme.io', 'Hk2_mN7qR4'],
    ['env dump:\nDB_PASS=Wq8.Lm3-Zk1\nfatal: password authentication failed', 'Wq8.Lm3-Zk1'],
    ['+ curl -fsS -u admin:Tr5#Kp2Lx9 https://jenkins.acme.local/job', 'Tr5#Kp2Lx9'],
  ])('masque la valeur : %s', (log, secret) => {
    const out = sanitizeLogs(log).clean
    expect(out).not.toContain(secret)
    expect(out).toContain('[REDACTED]')
  })

  it('garde le nom de la variable et le diagnostic', () => {
    expect(sanitizeLogs('DB_PASS=Wq8.Lm3-Zk1').clean).toBe('DB_PASS=[REDACTED]')
  })

  it("ne touche pas aux journaux sans secret ni aux références de variable", () => {
    const log = 'mkdir -p $BACKUP_DIR && tar czf /srv/a.tgz /data\nssh -p 2222 host\ncommit 4f427c8fc6082dcd21221c2b8aaba237d01997f4'
    expect(sanitizeLogs(log).clean).toBe(log)
  })
})
