import { describe, it, expect } from 'vitest'
import { acceptQuestion, anchors, questionFacts } from '../eval/lib/questions'

const facts = questionFacts({ command: 'pg_dump -Fc clients > /bak/clients.dump', exitCode: 1,
  errorLines: ['pg_dump: error: query failed: ERROR:  permission denied for table invoices'] })

describe('questions pour enquêter — garde-fous', () => {
  it('accepte une question qui cite un élément réel des faits', () => {
    expect(acceptQuestion('Le rôle utilisé par pg_dump a-t-il le droit SELECT sur la table invoices ?', facts)).not.toBeNull()
    expect(anchors('La table invoices est-elle nouvelle ?', facts)).toContain('invoices')
  })
  it('rejette une question générique, sans élément des faits', () => {
    expect(acceptQuestion('Avez-vous vérifié les logs du serveur ?', facts)).toBeNull()
  })
  it('rejette un identifiant inventé', () => {
    expect(acceptQuestion('Le fichier /etc/postgresql/pg_hba.conf autorise-t-il pg_dump ?', facts)).toBeNull()
  })
  it('rejette une cause affirmée en douce, ou une phrase qui n\'est pas une question', () => {
    expect(acceptQuestion('Est-ce que pg_dump échoue parce que le rôle a perdu ses droits ?', facts)).toBeNull()
    expect(acceptQuestion('Donner le droit SELECT sur invoices au rôle de pg_dump.', facts)).toBeNull()
  })
})
