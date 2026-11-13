// Ajouts réglés sur la moitié ENTRAÎNEMENT de public8 (2026-11-13) + prévention des échecs masqués (labo terrain 2, g12).
import { describe, it, expect } from 'vitest'
import { knownFix } from '../src/services/llm/known-fixes'
import { lintCommand, commandFinding } from '../src/services/llm/command-lint'

describe('public8 (entraînement) : nouvelles fiches', () => {
  it.each([
    ["Error starting process '/var/task/selenium-manager': Exec format error", 'exec-format-error'],
    ['Status: 404 Not Found\nNo input file specified.', 'php-no-input-file'],
    ['++ grep ERROR\n++ grep -v x\n+ CRIT_ERRS=\n', 'set-e-grep-no-match'],
    ['+ cd /data\n+ grep -q done status.txt', 'set-e-grep-no-match'],
    ['/bin/bash: probe.bash: command not found', 'script-without-dot-slash'],
    ['sh: 1: backup.sh: not found', 'script-without-dot-slash'],
    ["error: error running non-shared postrotate script for /var/log/nginx/access.log of '/var/log/nginx/*.log '", 'logrotate-postrotate'],
  ])('%s → %s', (logs, id) => expect(knownFix(logs)?.id).toBe(id))

  it('ne se déclenchent pas à tort', () => {
    expect(knownFix('/bin/sh: 1: node: not found')?.id).toBe('command-not-found')
    expect(knownFix('+ grep -q done status.txt\n+ echo ok')).toBeNull()   // grep suivi d'autre chose : le script a continué
  })
})

describe('échecs masqués : prévenus à l’import', () => {
  it('« || mail » et un pipe vers gzip sont signalés ; pipefail ou « || » seul dans une condition non', () => {
    expect(lintCommand('/opt/backup.sh || mail -s fail root').map(f => f.id)).toContain('cmd-or-masks')
    expect(lintCommand('mysqldump db | gzip > /b/db.sql.gz').map(f => f.id)).toContain('cmd-pipe-masks')
    expect(lintCommand('set -o pipefail; mysqldump db | gzip > /b/db.sql.gz')).toEqual([])
    expect(lintCommand('/opt/a.sh || /opt/b.sh')).toEqual([])
  })
  it('en anglais pour le dashboard en anglais, chaque règle traduite', () => {
    const all = 'sh x.sh % mysql -p s db; rsync -e ssh -p 22 a b; f$(date); sudo a || mail r; a | gzip'
    const fr = [...lintCommand(all), ...lintCommand('./r.sh')], en = [...lintCommand(all, 'en'), ...lintCommand('./r.sh', 'en')]
    expect(en.map(f => f.id)).toEqual(fr.map(f => f.id))
    expect(fr.length).toBe(9)
    en.forEach((f, i) => expect(f.cause).not.toBe(fr[i].cause))
  })
  it('n’expliquent jamais une panne (rien à lire dans les logs)', () => {
    expect(commandFinding('/opt/backup.sh || mail root', 'Error: anything')).toBeNull()
  })
})
