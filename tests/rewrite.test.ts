import { describe, it, expect } from 'vitest'
import { acceptRewrite } from '../src/services/llm/rewrite'

describe('réécriture du compte rendu : garde-fous', () => {
  it('acceptée : rien inventé, rien perdu', () => {
    expect(acceptRewrite({ text: "Ajoutez l'option --single-transaction à mysqldump.", invented: [], lost: [] })).toMatch(/single-transaction/)
  })
  it('rejetée si un identifiant est perdu ou inventé', () => {
    expect(acceptRewrite({ text: 'Ajoutez une option à mysqldump.', invented: [], lost: ['--single-transaction'] })).toBeNull()
    expect(acceptRewrite({ text: 'Éditez /etc/mysql/my.cnf.', invented: ['/etc/mysql/my.cnf'], lost: [] })).toBeNull()
  })
  it('rejetée si la coupe à 3 phrases fait perdre une commande', () => {
    expect(acceptRewrite({ text: 'Un. Deux. Trois. Lancez ensuite --repair-all.', invented: [], lost: [] })).toBeNull()
  })
})
