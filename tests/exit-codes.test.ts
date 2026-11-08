import { describe, it, expect } from 'vitest'
import { toolCodeFinding, exitCodeFinding } from '../src/services/llm/exit-codes'
import { analysisWithoutModel } from '../src/services/llm/analyzer'

// Levier 3 : sens officiel des codes (bash, curl, rsync). Un code vague (1, 2) ne conclut rien.
describe('codes officiels', () => {
  it.each([
    ['curl: (60) SSL certificate problem: unable to get local issuer certificate', 'curl-60', /autorités|CA/],
    ['curl: (7) Failed to connect to api.local port 8080', 'curl-7', /rien n'écoute/],
    ['curl: (28) Operation timed out after 30001 milliseconds', 'curl-28', /délai/],
    ['[curl] 60: [url] https://identity.example.com/v2.0/tokens', 'curl-60', /CA/],
    ['rsync error: error in rsync protocol data stream (code 12) at io.c(226)', 'rsync-12', /flux rsync/],
    ['rsync error: unexplained error (code 255) at io.c(226)', 'rsync-255', /SSH/],
  ])('%s', (logs, id, cause) => {
    const f = toolCodeFinding(logs)
    expect(f?.id).toBe(id)
    expect(f?.cause).toMatch(cause)
  })

  it('code inconnu ou absent : rien', () => {
    expect(toolCodeFinding('curl: (99) weird')).toBeNull()
    expect(toolCodeFinding('error: something failed')).toBeNull()
  })

  it.each([[126, /exécutée/], [127, /introuvable/], [137, /SIGKILL/], [143, /SIGTERM/], [139, /SIGSEGV/], [141, /SIGPIPE/]])(
    'code de sortie %i', (code, cause) => { expect(exitCodeFinding(code)?.cause).toMatch(cause) })

  it('codes vagues : aucune conclusion', () => {
    for (const c of [0, 1, 2, 3, 255, undefined]) expect(exitCodeFinding(c)).toBeNull()
  })

  it("sans modèle : un code de sortie précis donne la cause quand les logs n'en disent rien", () => {
    const a = analysisWithoutModel({ logs: 'starting export\nexport step 3/7', exitCode: 137 })
    expect(a.cause).toMatch(/SIGKILL/)
    expect(a.confidence).toBe('medium')
  })
})
