import { describe, it, expect, afterEach } from 'vitest'
import { systemPrompt, extractLogSignals } from '../src/services/llm/analyzer'

afterEach(() => { delete process.env.LLM_INPUT_FIX })

describe('LLM_INPUT_FIX : ce qu\'on donne au modèle', () => {
  it('les 3 consignes qui poussaient à recopier le symptôme sont bien remplacées', () => {
    const before = systemPrompt()
    process.env.LLM_INPUT_FIX = 'on'
    const after = systemPrompt()
    expect(before).toContain('cite la valeur EXACTE du log')
    expect(after).not.toContain('cite la valeur EXACTE du log')
    expect(after).not.toContain('cite les valeurs exactes des logs')
    expect(after).not.toContain('la cause est explicitement dans les logs')
    expect(after).toContain('POURQUOI')
  })
  it('le log entier passe quand il tient dans le budget (la ligne explicative sans « error » n\'est plus retirée)', () => {
    const logs = 'perl: warning: Setting locale failed.\nLANGUAGE = (unset), LC_ALL = (unset)\nERROR: job failed'
    expect(extractLogSignals(logs).keyLines).not.toContain('LC_ALL = (unset)')
    process.env.LLM_INPUT_FIX = 'on'
    expect(extractLogSignals(logs).keyLines).toContain('LC_ALL = (unset)')
  })
})
