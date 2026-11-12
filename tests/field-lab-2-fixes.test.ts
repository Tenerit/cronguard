// Corrections tirées du labo terrain 2 (2026-11-12), sur les situations exactes des cas observés.
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { commandToolFinding } from '../src/services/llm/exit-codes'
import { analysisWithoutModel } from '../src/services/llm/analyzer'
import { sanitizeLogs } from '../src/services/sanitizer'
import { pathProbe } from '../sdk/node/cronguard'

describe('labo terrain 2 : corrections', () => {
  it('g29 : wget reçoit un mot isolé comme 2e adresse (espace dans l’URL)', () => {
    const f = commandToolFinding('wget -q -O /dev/null http://www.urlgoeshere.co.uk/index.php cron_event', 4)
    expect(f?.id).toBe('wget-stray-arg')
    expect(f?.cause).toContain('cron_event')
  })
  it('wget silencieux : code officiel expliqué ; curl -s aussi ; rien pour un outil inconnu', () => {
    expect(commandToolFinding('wget -q -O /tmp/x https://example.test/feed', 8)?.id).toBe('wget-8')
    expect(commandToolFinding('PATH=/x curl -s https://example.test', 7)?.id).toBe('curl-7')
    expect(commandToolFinding('/opt/job.sh', 4)).toBeNull()
  })
  it('g7 : échec sans log, mais la commande envoie sa sortie dans un fichier : on le dit', () => {
    const a = analysisWithoutModel({ jobName: 'django', logs: '', exitCode: 1, command: '/usr/bin/python3 /app/manage.py crontab run 4bd3 >> /var/log/cron.log 2>&1' } as never)
    expect(a.cause).toContain('/var/log/cron.log')
  })
  it('g30 : « Password: » suivi d’une étiquette n’est pas un mot de passe ; un vrai l’est', () => {
    expect(sanitizeLogs('Password: pg_dump: error: connection to server failed').clean).toContain('pg_dump: error')
    expect(sanitizeLogs('password: hunter22secret').clean).not.toContain('hunter22secret')
  })
  it('g20 : nom de fichier nu avant l’erreur (« hw1_input.txt: No such file ») vérifié par la sonde', () => {
    process.chdir(mkdtempSync(join(tmpdir(), 'cg-bare-')))
    const out = pathProbe('/home/kali/hw1.sh: line 11: hw1_input.txt: No such file or directory')
    expect(out.find(x => x.path === 'hw1_input.txt')).toMatchObject({ relative: true, exists: false })
  })
})
