import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the embeddings module
vi.mock('./embeddings', () => ({
  generateEmbedding: vi.fn(),
}))

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(),
            })),
          })),
        })),
      })),
    })),
  })),
}))

describe('search', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.OPENAI_API_KEY = 'test-api-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  describe('semanticSearch', () => {
    it('generates embedding for query and searches via RPC', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      const mockResults = [
        {
          id: 'item-1',
          title: 'React Three Fiber Guide',
          summary: 'A guide to R3F',
          domain: 'vibe-coding',
          content_type: 'repo',
          tags: ['r3f', 'three.js'],
          github_url: 'https://github.com/pmndrs/react-three-fiber',
          source_url: 'https://example.com',
          similarity: 0.85,
        },
      ]

      const { generateEmbedding } = await import('./embeddings')
      vi.mocked(generateEmbedding).mockResolvedValue({
        embedding: mockEmbedding,
        cost: 0.00001,
      })

      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({ data: mockResults, error: null }),
      } as unknown as ReturnType<typeof createClient>)

      const { semanticSearch } = await import('./search')
      const results = await semanticSearch('camera controls', {
        userId: 'user-123',
        limit: 10,
      })

      expect(results.length).toBe(1)
      expect(results[0].title).toBe('React Three Fiber Guide')
      expect(results[0].similarity).toBe(0.85)
    })

    it('returns empty array when embedding fails', async () => {
      const { generateEmbedding } = await import('./embeddings')
      vi.mocked(generateEmbedding).mockResolvedValue(null)

      const { semanticSearch } = await import('./search')
      const results = await semanticSearch('test query', {
        userId: 'user-123',
      })

      expect(results).toEqual([])
    })

    it('returns empty array when RPC fails', async () => {
      const mockEmbedding = Array(1536).fill(0.1)

      const { generateEmbedding } = await import('./embeddings')
      vi.mocked(generateEmbedding).mockResolvedValue({
        embedding: mockEmbedding,
        cost: 0.00001,
      })

      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC failed' } }),
      } as unknown as ReturnType<typeof createClient>)

      const { semanticSearch } = await import('./search')
      const results = await semanticSearch('test query', {
        userId: 'user-123',
      })

      expect(results).toEqual([])
    })
  })

  describe('keywordSearch', () => {
    it('searches items by title and summary', async () => {
      const mockResults = [
        {
          id: 'item-2',
          title: 'Keyword Match',
          summary: 'Found via keyword',
          domain: null,
          content_type: null,
          tags: null,
          github_url: null,
          source_url: 'https://example.com',
        },
      ]

      const mockLimit = vi.fn().mockResolvedValue({ data: mockResults, error: null })
      const mockOr = vi.fn(() => ({ limit: mockLimit }))
      const mockEq2 = vi.fn(() => ({ or: mockOr }))
      const mockEq1 = vi.fn(() => ({ eq: mockEq2 }))
      const mockSelect = vi.fn(() => ({ eq: mockEq1 }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as unknown as ReturnType<typeof createClient>)

      const { keywordSearch } = await import('./search')
      const results = await keywordSearch('keyword', {
        userId: 'user-123',
      })

      expect(results.length).toBe(1)
      expect(results[0].title).toBe('Keyword Match')
      expect(results[0].similarity).toBe(0.5) // Default for keyword matches
    })
  })

  describe('hybridSearch', () => {
    it('returns semantic results when available', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      const mockResults = [
        {
          id: 'item-1',
          title: 'Semantic Match',
          summary: 'Found via embedding',
          domain: 'vibe-coding',
          content_type: 'repo',
          tags: ['test'],
          github_url: null,
          source_url: 'https://example.com',
          similarity: 0.9,
        },
      ]

      const { generateEmbedding } = await import('./embeddings')
      vi.mocked(generateEmbedding).mockResolvedValue({
        embedding: mockEmbedding,
        cost: 0.00001,
      })

      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({ data: mockResults, error: null }),
      } as unknown as ReturnType<typeof createClient>)

      const { hybridSearch } = await import('./search')
      const results = await hybridSearch('semantic query', {
        userId: 'user-123',
      })

      expect(results.length).toBe(1)
      expect(results[0].title).toBe('Semantic Match')
      expect(results[0].similarity).toBe(0.9)
    })

    it('falls back to keyword search when semantic returns empty', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      const keywordResults = [
        {
          id: 'item-2',
          title: 'Keyword Fallback',
          summary: 'Found via keyword',
          domain: null,
          content_type: null,
          tags: null,
          github_url: null,
          source_url: 'https://example.com',
        },
      ]

      const { generateEmbedding } = await import('./embeddings')
      vi.mocked(generateEmbedding).mockResolvedValue({
        embedding: mockEmbedding,
        cost: 0.00001,
      })

      const mockLimit = vi.fn().mockResolvedValue({ data: keywordResults, error: null })
      const mockOr = vi.fn(() => ({ limit: mockLimit }))
      const mockEq2 = vi.fn(() => ({ or: mockOr }))
      const mockEq1 = vi.fn(() => ({ eq: mockEq2 }))
      const mockSelect = vi.fn(() => ({ eq: mockEq1 }))
      const mockFrom = vi.fn(() => ({ select: mockSelect }))

      const { createClient } = await import('@supabase/supabase-js')
      vi.mocked(createClient).mockReturnValue({
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
        from: mockFrom,
      } as unknown as ReturnType<typeof createClient>)

      const { hybridSearch } = await import('./search')
      const results = await hybridSearch('fallback query', {
        userId: 'user-123',
      })

      expect(results.length).toBe(1)
      expect(results[0].title).toBe('Keyword Fallback')
      expect(results[0].similarity).toBe(0.5)
    })
  })
})
