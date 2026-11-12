// Règle et garde-fous de la proposition CG_EXPECT : exemples écrits à la main, hors du jeu d'essai (eval/expect-suggest.ts).
import { describe, it, expect } from 'vitest'
import { ruleExpect, acceptablePath, globDates } from '../src/services/expect-suggest'

describe('proposition CG_EXPECT : règle', () => {
  it.each([
    ['pg_dump -Fc shop > /bak/shop.dump', '/bak/shop.dump'],
    ['pg_dump -Fc shop -f /bak/shop-$(date +%F).dump', '/bak/shop-*.dump'],
    ['tar czf /bak/www-`date +\\%d`.tgz /var/www', '/bak/www-*.tgz'],
    ['wget -q -O /data/rates.csv https://example.test/rates.csv', '/data/rates.csv'],
    ['curl -fsS -o /data/feed.xml https://example.test/feed', '/data/feed.xml'],
  ])('%s → %s', (cmd, want) => expect(ruleExpect(cmd)).toBe(want))

  it.each([
    '/opt/jobs/backup.sh >> /var/log/backup.log 2>&1',     // journal
    '/opt/jobs/sync.sh > /dev/null 2>&1',                    // rien
    'curl -s https://example.test/cron.php',                  // appel d'URL
    '/opt/jobs/report.sh 2> /tmp/errors.txt',                 // erreurs seulement
    'wget -q -O - https://example.test/cron',                 // sortie standard
  ])('rien pour : %s', (cmd) => expect(ruleExpect(cmd)).toBeNull())
})

describe('proposition CG_EXPECT : garde-fous (aussi appliqués au modèle)', () => {
  it('refuse un chemin absent de la commande (inventé)', () => {
    expect(acceptablePath('/bak/other.dump', 'pg_dump shop > /bak/shop.dump')).toBe(false)
    expect(acceptablePath('/bak/shop.dump', 'pg_dump shop > /bak/shop.dump')).toBe(true)
  })
  it('refuse un journal, /dev/null, la sortie standard', () => {
    for (const p of ['/var/log/x.log', '/srv/logs/out.txt', '/dev/null', '-', 'error.txt'])
      expect(acceptablePath(p, `job > ${p}`)).toBe(false)
  })
  it('date calculée → joker', () => {
    expect(globDates('/bak/db_$(date +%F).sql')).toBe('/bak/db_*.sql')
    expect(globDates('backup_`date "+\\%F"`.sql')).toBe('backup_*.sql')
  })
})
