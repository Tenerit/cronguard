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

import { alternatives, keepsAlternatives, acceptExplanation } from '../src/services/llm/explain'
describe('essai 4 : toutes les possibilités gardées', () => {
  const cause = 'Le service distant ne répond pas : indisponible, surchargé, ou proxy défini dans votre session (http_proxy) mais absent sous cron.'
  it('découpe les possibilités, sans les exemples entre parenthèses', () => {
    expect(alternatives(cause)).toHaveLength(3)
    expect(alternatives("L'utilisateur n'a pas les droits : il appartient à un autre utilisateur (www-data, root), ou umask restrictif.")).toHaveLength(2)
    expect(alternatives("Plus d'inodes : trop de petits fichiers.")).toEqual([])
  })
  it('rejette un texte qui en perd une, accepte celui qui les garde toutes', () => {
    expect(keepsAlternatives(cause, 'Le service est indisponible ou surchargé.')).toBe(false)
    expect(keepsAlternatives(cause, 'Le service est indisponible, surchargé, ou votre proxy manque sous cron.')).toBe(true)
    expect(acceptExplanation(cause, { text: 'Le service est indisponible ou surchargé. Vérifiez-le.', invented: [] })).toBeNull()
  })
  it('garde-fou : la ponctuation finale ne fait pas un faux identifiant', () => {
    expect(acceptExplanation('PATH minimal sans /usr/local/bin.', { text: 'Cron ne cherche pas dans /usr/local/bin. Appelez la commande en chemin absolu.', invented: [] })).not.toBeNull()
  })
})

describe('découpage en phrases', () => {
  it('ne coupe pas sur le point d\'un nom de fichier, ne perd pas le début', () => {
    const t = 'Le fichier /var/lib/redis/dump.rdb appartient à root. Le job tourne sous app. Changez le propriétaire. Relancez.'
    expect(capSentences(t)).toBe('Le fichier /var/lib/redis/dump.rdb appartient à root. Le job tourne sous app. Changez le propriétaire.')
    expect(capSentences('Installez le module pour script.py (pip --user). Relancez.')).toBe('Installez le module pour script.py (pip --user). Relancez.')
  })
})
