import { describe, it, expect } from 'vitest'
import { scheduleText } from '../src/services/schedule-text'

describe('scheduleText — planning écrit par le code', () => {
  it.each([
    ['* * * * *', 'toutes les minutes'],
    ['*/5 * * * *', 'toutes les 5 minutes'],
    ['0 * * * *', 'toutes les heures à la minute 0'],
    ['30 2 * * *', 'tous les jours, à 02:30'],
    ['15 1 * * 1-5', 'du lundi au vendredi, à 01:15'],
    ['0 6 * * 1', 'le lundi, à 06:00'],
    ['0 22 * * *', 'tous les jours, à 22:00'],
    ['0 0 1 * *', 'le 1er du mois, à 00:00'],
    ['0 3,12 * * *', 'tous les jours, à 03:00 et 12:00'],
    ['0 */12 * * *', 'toutes les 12 heures, à la minute 00'],
    ['@reboot', 'au démarrage de la machine'],
  ])('%s → %s', (expr, txt) => expect(scheduleText(expr)).toBe(txt))

  it('signale une valeur hors limites au lieu de la traduire', () => {
    expect(scheduleText('0 24 * * *')).toBe('expression invalide « 0 24 * * * » : cron ne lancera pas ce job')
    expect(scheduleText('*/30 * * * *')).toBe('toutes les 30 minutes')
    expect(scheduleText('0 */12 * * *')).toBe('toutes les 12 heures, à la minute 00')
  })

  it("rend telle quelle une forme qu'il ne sait pas dire", () => {
    expect(scheduleText('45 8,12,16 4-31 * 1-5')).toBe('selon « 45 8,12,16 4-31 * 1-5 »')
  })
})
