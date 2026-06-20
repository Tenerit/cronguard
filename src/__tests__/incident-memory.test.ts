// Mock embeddings : embed + memoryEnabled contrôlés, cosine RÉEL
jest.mock('../services/llm/embeddings', () => {
  const actual = jest.requireActual('../services/llm/embeddings')
  return { ...actual, embed: jest.fn(), memoryEnabled: jest.fn() }
})

const mockQuery = jest.fn()
jest.mock('../db', () => ({ db: { query: (...a: unknown[]) => mockQuery(...a) } }))

import { recallSimilar, rememberIncident } from '../services/llm/incident-memory'
import { embed, memoryEnabled } from '../services/llm/embeddings'

const mEmbed   = embed as jest.Mock
const mEnabled = memoryEnabled as jest.Mock

beforeEach(() => { jest.clearAllMocks() })

function candidate(emb: number[], cause: string, action: string, category: string) {
  return { cause, action, category, embedding: emb, logs: `log ${cause}` }
}

describe('recallSimilar()', () => {
  it('is a no-op when memory disabled', async () => {
    mEnabled.mockReturnValue(false)
    const out = await recallSimilar('cli-1', 'ECONNREFUSED', 2)
    expect(out).toEqual([])
    expect(mEmbed).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns [] when the query cannot be embedded', async () => {
    mEnabled.mockReturnValue(true)
    mEmbed.mockResolvedValue(null)
    expect(await recallSimilar('cli-1', 'x', 2)).toEqual([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('ranks validated incidents by cosine, applies the threshold, maps to few-shot', async () => {
    mEnabled.mockReturnValue(true)
    mEmbed.mockResolvedValue([1, 0, 0])                 // vecteur de la requête
    mockQuery.mockResolvedValue({ rows: [
      candidate([0, 1, 0],     'cC', 'aC', 'timeout'),  // cos 0   → exclu (< 0.6)
      candidate([1, 0, 0],     'cA', 'aA', 'database'),  // cos 1   → 1er
      candidate([0.8, 0.6, 0], 'cB', 'aB', 'network'),   // cos 0.8 → 2e
    ]})

    const out = await recallSimilar('cli-1', 'connection refused', 2)
    expect(out).toHaveLength(2)
    expect(out.map(e => e.cause)).toEqual(['cA', 'cB'])
    expect(out[0]).toMatchObject({ cause: 'cA', action: 'aA', category: 'database' })
    expect(out[0].logs).toContain('log cA')
  })

  it('respects k', async () => {
    mEnabled.mockReturnValue(true)
    mEmbed.mockResolvedValue([1, 0])
    mockQuery.mockResolvedValue({ rows: [
      candidate([1, 0], 'c1', 'a1', 'code'),
      candidate([0.9, 0.1], 'c2', 'a2', 'code'),
      candidate([0.85, 0.2], 'c3', 'a3', 'code'),
    ]})
    expect(await recallSimilar('cli-1', 'x', 1)).toHaveLength(1)
  })
})

describe('rememberIncident()', () => {
  it('embeds and stores the vector on the analysis row', async () => {
    mEnabled.mockReturnValue(true)
    mEmbed.mockResolvedValue([0.1, 0.2, 0.3])
    mockQuery.mockResolvedValue({ rows: [] })
    await rememberIncident('ana-1', 'deadlock detected')
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toMatch(/UPDATE analyses SET embedding/)
    expect(params).toEqual([[0.1, 0.2, 0.3], 'ana-1'])
  })

  it('is a no-op when memory disabled', async () => {
    mEnabled.mockReturnValue(false)
    await rememberIncident('ana-1', 'x')
    expect(mEmbed).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('skips the DB write when embedding fails', async () => {
    mEnabled.mockReturnValue(true)
    mEmbed.mockResolvedValue(null)
    await rememberIncident('ana-1', 'x')
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
