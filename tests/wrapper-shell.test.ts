// Enveloppe de l'import (2026-11-12, labo terrain 2, g40) : la commande tourne sous le shell de cron, pas sous bash.
// Vérifié dans Debian avec son vrai cron : « cat <(ls) » échoue comme sans CronGuard ; avec SHELL=/bin/bash il réussit.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { commandFinding } from '../src/services/llm/command-lint'

describe('enveloppe de l’import', () => {
  it('le dashboard et le script d’import lancent la commande avec ${SHELL:-/bin/sh}, plus avec bash', () => {
    const dash = readFileSync('src/api/dashboard.js', 'utf8'), cli = readFileSync('sdk/bash/cronguard-import.sh', 'utf8')
    expect(dash).toContain('"\\${SHELL:-/bin/sh}" -c "$0"')
    expect(cli).toContain('\\"\\${SHELL:-/bin/sh}\\" -c \\"\\$0\\"')
    expect(dash).not.toMatch(/cg_run \$\{m\.ping_key\} bash -c/)
  })
  it('une syntaxe bash lancée par sh : la cause est établie par la commande', () => {
    expect(commandFinding('cat <(ls /data)', '/bin/sh: 1: Syntax error: "(" unexpected')?.id).toBe('cmd-bashism-sh')
  })
})
