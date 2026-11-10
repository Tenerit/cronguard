import { describe, it, expect, vi } from 'vitest'
vi.mock('axios', () => ({ default: { post: vi.fn() }, AxiosError: class extends Error {} }))
import axios from 'axios'
import { inventedIdentifiers, explainAnalysis } from '../src/services/llm/explain'

const reply = (explication: string) => vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify({ explication }) } }] } })
const base = { cause: 'cron démarre avec un PATH minimal : la commande est introuvable.', action: 'Appeler /usr/local/bin/node en chemin absolu.',
  prevention: '', checks: [], severity: 'medium', category: 'dependency', confidence: 'high', data_impact: 'none', fix_minutes: 15, fromCache: false } as const

describe("rôle IA n°1 : expliquer sans inventer", () => {
  it('garde-fou : chemin, option ou fichier absent des faits = inventé', () => {
    expect(inventedIdentifiers('Lancez /usr/local/bin/node --version', 'Appeler /usr/local/bin/node')).toEqual(['--version'])
    expect(inventedIdentifiers('Éditez /etc/cron.d/backup.conf', 'rien')).toEqual(['/etc/cron.d/backup.conf'])
    expect(inventedIdentifiers('Le programme est introuvable pour cron.', 'x')).toEqual([])
  })
  it("panne non établie : aucun appel au modèle (on n'habille pas une incertitude)", async () => {
    process.env.LLM_BASE_URL = 'http://x/v1'
    vi.mocked(axios.post).mockClear()
    expect(await explainAnalysis({ ...base }, 'logs')).toBeNull()
    expect(axios.post).not.toHaveBeenCalled()
  })
  it('explication fidèle acceptée, explication qui invente rejetée', async () => {
    process.env.LLM_BASE_URL = 'http://x/v1'
    const a = { ...base, knownFix: { id: 'command-not-found' } as never }
    reply('Cron ne trouve pas le programme car il cherche dans moins de dossiers que votre session. Appelez-le par son chemin complet.')
    expect(await explainAnalysis(a, 'node: not found')).toMatch(/chemin complet/)
    reply('Cron ne trouve pas le programme. Ajoutez export PATH=/opt/node/bin dans /etc/profile.d/node.sh pour corriger.')
    expect(await explainAnalysis(a, 'node: not found')).toBeNull()
  })
})

import { explainable, capSentences } from '../src/services/llm/explain'
describe('essai 3 : causes certaines seulement, 3 phrases', () => {
  it("une cause à alternatives n'est pas confiée au modèle", () => {
    expect(explainable({ cause: 'Service indisponible, ou proxy absent sous cron.', knownFix: {} as never })).toBe(false)
    expect(explainable({ cause: "Le système de fichiers n'a plus d'inodes.", knownFix: {} as never })).toBe(true)
    expect(explainable({ cause: 'Cause non établie.' })).toBe(false)
  })
  it('coupe à 3 phrases', () => {
    expect(capSentences('Un. Deux ! Trois ? Quatre.')).toBe('Un. Deux ! Trois ?')
    expect(capSentences('Une seule phrase sans point')).toBe('Une seule phrase sans point')
  })
})
