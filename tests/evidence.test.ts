import { describe, it, expect } from 'vitest'
import { evidenceLines, withLogHints } from '../src/services/llm/evidence'

const LOGS = [
  '2026-11-07 02:00:01 starting backup',
  '2026-11-07 02:00:03 pg_dump: error: connection to server at "db-primary.internal" (10.0.0.12), port 5432 failed: Connection refused',
  '2026-11-07 02:00:03 retrying in 5s',
  '2026-11-07 02:00:08 pg_dump: error: connection to server at "db-primary.internal" (10.0.0.12), port 5432 failed: Connection refused',
  '2026-11-07 02:00:09 backup aborted',
].join('\n')

describe('evidenceLines', () => {
  it('ne renvoie que des lignes recopiées des logs, sans doublon', () => {
    const ev = evidenceLines(LOGS, 'connexion refusée au serveur db-primary sur le port 5432')
    expect(ev.length).toBeGreaterThan(0)
    for (const l of ev) expect(LOGS.split('\n')).toContain(l)
    expect(new Set(ev).size).toBe(ev.length)
  })

  it('rapproche une cause en français de logs en anglais', () => {
    const ev = evidenceLines('step 1 ok\nwrite failed: No space left on device\nstep 3 skipped', 'disque plein')
    expect(ev).toEqual(['write failed: No space left on device'])
  })

  it('sans mot commun, retombe sur la dernière ligne d erreur', () => {
    expect(evidenceLines('starting\nFATAL: something odd happened\nexit', 'cause inconnue')).toEqual(['FATAL: something odd happened'])
  })

  it('rien sans logs, au plus 2 lignes, coupées à 240 caractères', () => {
    expect(evidenceLines('', 'disque plein')).toEqual([])
    const long = Array.from({ length: 5 }, (_, i) => `disk full on /dev/sd${i} ` + 'x'.repeat(300)).join('\n')
    const ev = evidenceLines(long, 'disque plein')
    expect(ev).toHaveLength(2)
    for (const l of ev) expect(l.length).toBeLessThanOrEqual(240)
  })

  it('withLogHints lit la cause dans diagnosis, objet ou texte JSON, et nettoie les logs', () => {
    const sanitize = (s: string) => s.replace(/secret=\S+/g, 'secret=[REDACTED]')
    const logs = 'auth failed: access denied secret=hunter2'
    for (const diagnosis of [{ cause: 'accès refusé' }, JSON.stringify({ cause: 'accès refusé' })]) {
      const r = withLogHints({ diagnosis, ping_output: logs }, sanitize)
      expect(r.evidence).toEqual(['auth failed: access denied secret=[REDACTED]'])
    }
    expect(withLogHints({ diagnosis: null, ping_output: null }, sanitize).evidence).toEqual([])
  })
})
