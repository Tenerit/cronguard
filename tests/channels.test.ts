import { describe, it, expect } from 'vitest'
import { format, splitNtfy, message } from '../src/services/alerts/channels'
import { T, localizeFact } from '../src/services/alerts/i18n'
import { teamsCard } from '../src/services/alerts'

// Chaque plateforme reçoit SON format, avec la cause, la ligne décisive et les liens ✅ / ✏️.
const m = {
  title: '🟠 backup-db en échec (production)', severity: 'high', status: 'https://cg.local/status/m1',
  facts: [['Cause', 'pg_dump plus ancien que le serveur'], ['Piste à vérifier', 'Installer pg_dump 16']] as Array<[string, string]>,
  line: 'pg_dump: error: aborting because of server version mismatch',
  ok: 'https://cg.local/r/tok', fix: 'https://cg.local/r/tok?v=fix', L: T.fr,
}

describe('autres plateformes', () => {
  it('Discord : embed avec champs, ligne décisive et liens', () => {
    const e = format.discord(m).embeds[0]
    expect(e.fields.map(f => f.name)).toEqual(['Cause', 'Piste à vérifier'])
    expect(e.description).toContain('server version mismatch')
    expect(e.description).toContain('[✅ Analyse juste](https://cg.local/r/tok)')
    expect(e.description).toContain('[✏️ Corriger](https://cg.local/r/tok?v=fix)')
  })

  it('Google Chat : carte v2 avec vrais boutons', () => {
    const c = format.gchat(m).cardsV2[0].card as any
    const buttons = c.sections[0].widgets.at(-1).buttonList.buttons.map((b: any) => [b.text, b.onClick.openLink.url])
    expect(buttons).toEqual([['✅ Analyse juste', m.ok], ['✏️ Corriger', m.fix], ['Page de statut', m.status]])
  })

  it('Mattermost / Rocket.Chat : attachments au format Slack (pas de blocks)', () => {
    const a = format.mattermost(m).attachments[0]
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(a.text).toContain('[✏️ Corriger]')
  })

  it('ntfy : priorité haute, boutons d\'action, URL découpée en serveur + topic', () => {
    expect(splitNtfy('https://ntfy.example.org/cronguard-ops')).toEqual({ base: 'https://ntfy.example.org', topic: 'cronguard-ops' })
    expect(splitNtfy('https://ntfy.example.org/')).toBeNull()
    const n = format.ntfy(m, 'cronguard-ops')
    expect(n).toMatchObject({ topic: 'cronguard-ops', priority: 5, click: m.ok })
    expect(n.actions.map(a => a.label)).toEqual(['✅ Analyse juste', '✏️ Corriger', 'Statut'])
  })

  it('PagerDuty : déclenche avec une clé de dédoublonnage par job (le rétablissement la résout)', () => {
    const p = format.pagerduty(m, 'R'.repeat(32), 'backup-db')
    expect(p).toMatchObject({ event_action: 'trigger', dedup_key: 'cronguard:backup-db', payload: { severity: 'error', source: 'cronguard' } })
    expect(p.payload.custom_details['Ligne décisive']).toContain('version mismatch')
    expect(p.links[0]).toEqual({ href: m.ok, text: '✅ Analyse juste' })
  })
})

describe('alertes en anglais (clients.lang = en)', () => {
  const analysis: any = { cause: 'pg_dump older than the server', action: 'Install pg_dump 16', severity: 'high', confidence: 'high', category: 'database',
    changed: ['variable PGPASSWORD absente depuis la dernière réussite', '/bak/run.sh modifié depuis la dernière réussite : 18 octets, 2026-11-12 01:05 → 45 octets, 2026-11-12 01:05', 'version de pg_dump : 15.4 → 16.1'],
    step: "Arrêté pendant l'étape « upload » (après 3 s) — avant : dump : 12 s", evidence: ['pg_dump: error: aborting'] }
  const payload: any = { jobName: 'backup-db', env: 'production', analysis, statusPageUrl: 'https://cg.local/s', reviewUrl: 'https://cg.local/r/t',
    client: { email: 'a@b.c', lang: 'en' } }
  const FRENCH = /échec|Piste|Changé|Étape|Corriger|Analyse juste|Page de statut|absente|modifié|octets|Arrêté|avant :|version de/

  it('faits des SDK traduits', () => {
    expect(localizeFact('en', analysis.changed[0])).toBe('variable PGPASSWORD missing since the last success')
    expect(localizeFact('en', analysis.changed[1])).toBe('/bak/run.sh changed since the last success : 18 bytes, 2026-11-12 01:05 → 45 bytes, 2026-11-12 01:05')
    expect(localizeFact('en', analysis.changed[2])).toBe('pg_dump version : 15.4 → 16.1')
    expect(localizeFact('en', analysis.step)).toBe('Stopped during step "upload" (after 3 s) — before: dump : 12 s')
    expect(localizeFact('fr', analysis.changed[0])).toBe(analysis.changed[0])
  })
  it('Teams et les 5 autres plateformes : plus aucun mot français dans l’habillage', () => {
    const m = message(payload)
    const outs = [teamsCard(payload), format.discord(m), format.gchat(m), format.mattermost(m), format.ntfy(m, 't'), format.pagerduty(m, 'k', 'backup-db')]
    for (const o of outs) expect(JSON.stringify(o)).not.toMatch(FRENCH)
    expect(m.title).toContain('backup-db failed (production)')
  })
  it('sans langue : français, comme avant', () => {
    expect(message({ ...payload, client: { email: 'a@b.c' } }).title).toContain('en échec')
  })
})
