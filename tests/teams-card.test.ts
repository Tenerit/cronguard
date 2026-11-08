import { describe, it, expect } from 'vitest'
import { teamsCard } from '../src/services/alerts'

// Carte Teams (webhook Workflows) : lisible en 5 s à 2h40, avec les deux boutons de retour.
describe('carte Teams', () => {
  const payload = {
    jobName: 'backup-db', env: 'production', statusPageUrl: 'https://cg.local/status/m1',
    reviewUrl: 'https://cg.local/r/tok',
    analysis: { cause: 'pg_dump plus ancien que le serveur', action: 'Installer pg_dump 16', prevention: '', checks: [],
      severity: 'high', category: 'database', confidence: 'high', data_impact: 'none', fix_minutes: 15, fromCache: false,
      model: 'llama3.2:3b', evidence: ['pg_dump: error: aborting because of server version mismatch'] },
    client: { email: 'ops@x', teamsWebhook: 'https://example.invalid/wf' },
  } as const
  const card = teamsCard(payload as any) as any
  const content = card.attachments[0].content

  it('format attendu par un workflow Teams (carte adaptative)', () => {
    expect(card.type).toBe('message')
    expect(card.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(content.type).toBe('AdaptiveCard')
  })
  it('cause, action et ligne décisive visibles', () => {
    const text = JSON.stringify(content.body)
    expect(text).toContain('pg_dump plus ancien que le serveur')
    expect(text).toContain('Installer pg_dump 16')
    expect(text).toContain('server version mismatch')
  })
  it('boutons ✅ / ✏️ vers la page signée, puis la page de statut', () => {
    expect(content.actions.map((a: any) => [a.title, a.url])).toEqual([
      ['✅ Analyse juste', 'https://cg.local/r/tok'],
      ['✏️ Corriger', 'https://cg.local/r/tok?v=fix'],
      ['Page de statut', 'https://cg.local/status/m1'],
    ])
  })
  it('sans lien signé : seulement la page de statut', () => {
    const c = teamsCard({ ...payload, reviewUrl: undefined } as any) as any
    expect(c.attachments[0].content.actions).toHaveLength(1)
  })
})
