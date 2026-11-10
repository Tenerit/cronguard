import { describe, it, expect } from 'vitest'
import { matchTeamFix, stableTrigger, draftTeamFix, type TeamFix } from '../src/services/team-fixes'

const fix = (match: string): TeamFix => ({ id: '1', match, title: 't', cause: 'c', action: 'a', category: 'unknown',
  created_by: null, created_at: '', source_analysis: null })

describe("fiches d'équipe", () => {
  it('déclencheur littéral, sans casse, jamais une regex', () => {
    expect(matchTeamFix([fix('reconcile: ERROR stale advisory lock')], 'x\nRECONCILE: error STALE advisory lock 4471\n')?.id).toBe('1')
    expect(matchTeamFix([fix('lock (.*) held')], 'lock 12 held')).toBeNull()   // pas interprété comme regex
    expect(matchTeamFix([fix('ledger drift')], 'something else')).toBeNull()
  })
  it('déclencheur stable : sans horodatage, préfixe syslog ni PID', () => {
    expect(stableTrigger('2026-11-10T02:00:01.123Z ERROR: stale advisory lock held')).toBe('ERROR: stale advisory lock held')
    expect(stableTrigger('Nov 10 02:00:01 host reconcile[812]: stale lock held')).toBe('stale lock held')
  })
  it('brouillon : ligne de la panne et correction réelle, rien d inventé, secrets masqués', () => {
    const d = draftTeamFix('starting\n2026-11-10T02:00:01Z reconcile: ERROR stale advisory lock 4471 held by dead session\nexit 1',
      'pg_terminate_backend sur la session morte puis relance')
    expect(d.match).toBe('reconcile: ERROR stale advisory lock 4471 held by dead session')
    expect(d.action).toBe('pg_terminate_backend sur la session morte puis relance')
    expect(d.cause).toContain(d.match)
    expect(draftTeamFix('ERROR: login failed password=hunter2secret', 'x').match).not.toContain('hunter2secret')
  })
})
