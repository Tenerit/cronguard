import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../src/config/redis', () => ({ redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn() } }))
import { analyzeFailure, analysisWithoutModel, llmEnabled } from '../src/services/llm/analyzer'

// IA optionnelle : sans LLM, CronGuard doit rester utile (pack + ligne de log), sans jamais
// appeler le réseau ni prétendre à une analyse du modèle.
const saved = { url: process.env.LLM_BASE_URL, en: process.env.LLM_ENABLED }
afterEach(() => { process.env.LLM_BASE_URL = saved.url; process.env.LLM_ENABLED = saved.en })
const unset = (k: 'LLM_BASE_URL' | 'LLM_ENABLED') => { delete process.env[k] }

describe('IA optionnelle', () => {
  it('llmEnabled : faux sans LLM_BASE_URL ou avec LLM_ENABLED=false', () => {
    unset('LLM_BASE_URL'); unset('LLM_ENABLED')
    expect(llmEnabled()).toBe(false)
    process.env.LLM_BASE_URL = 'http://ollama:11434/v1'
    expect(llmEnabled()).toBe(true)
    process.env.LLM_ENABLED = 'false'
    expect(llmEnabled()).toBe(false)
  })

  it('pack reconnu : cause, catégorie et étapes viennent du pack, modèle « none »', () => {
    const a = analysisWithoutModel({ logs: 'tar: write error\nENOSPC: no space left on device, write' })
    expect(a.cause).toMatch(/volume de destination est plein/)
    expect(a.category).toBe('resources')
    expect(a.action).toMatch(/rétention/)
    expect(a.model).toBe('none')
    expect(a.confidence).toBe('high')   // fiche univoque : même calibration qu'avec le modèle
  })

  it('panne inconnue : cite la dernière ligne d erreur, confiance basse, catégorie inconnue', () => {
    const a = analysisWithoutModel({ logs: 'step 1\nFATAL: widget frobnication failed\nexit' })
    expect(a.cause).toContain('FATAL: widget frobnication failed')
    expect(a.category).toBe('unknown')
    expect(a.confidence).toBe('low')
  })

  it('sans logs : ne devine rien', () => {
    expect(analysisWithoutModel({ logs: '', exitCode: 2 }).cause).toContain('code de sortie 2')
  })

  it("analyzeFailure sans LLM n'appelle pas le réseau", async () => {
    unset('LLM_BASE_URL')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const a = await analyzeFailure({ jobName: 'backup', clientId: 'c', monitorId: 'm', logs: 'Out of memory: Killed process 42 (python3)' })
    expect(a?.model).toBe('none')
    expect(a?.cause).toContain('OOM')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
