import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('embeddings', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    process.env.OPENAI_API_KEY = 'test-api-key'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  describe('generateEmbedding', () => {
    it('returns embedding vector for text input', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: mockEmbedding }],
            usage: { prompt_tokens: 10, total_tokens: 10 },
          }),
      })

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).not.toBeNull()
      expect(result?.embedding).toHaveLength(1536)
      expect(result?.cost).toBeGreaterThan(0)
    })

    it('returns null when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).toBeNull()
    })

    it('returns null on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).toBeNull()
    })

    it('calls OpenAI API with correct parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: Array(1536).fill(0.1) }],
            usage: { prompt_tokens: 10, total_tokens: 10 },
          }),
      })

      const { generateEmbedding } = await import('./embeddings')
      await generateEmbedding('test text')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      )

      const callBody = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      )
      expect(callBody.model).toBe('text-embedding-3-small')
      expect(callBody.input).toBe('test text')
    })

    it('calculates cost from token usage', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: Array(1536).fill(0.1) }],
            // 1M tokens @ $0.02/1M = $0.02
            // 1000 tokens = $0.00002
            usage: { prompt_tokens: 1000, total_tokens: 1000 },
          }),
      })

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result?.cost).toBeCloseTo(0.00002, 8)
    })
  })

  describe('buildEmbeddingText', () => {
    it('combines title, summary, and tags', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: 'Test Title',
        summary: 'Test summary here',
        tags: ['tag1', 'tag2'],
      })

      expect(result).toBe('Test Title\n\nTest summary here\n\nTags: tag1, tag2')
    })

    it('handles missing fields gracefully', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: 'Just Title',
        summary: null,
        tags: null,
      })

      expect(result).toBe('Just Title')
    })

    it('handles empty tags array', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: 'Title',
        summary: 'Summary',
        tags: [],
      })

      expect(result).toBe('Title\n\nSummary')
    })

    it('returns empty string when all fields are null', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: null,
        summary: null,
        tags: null,
      })

      expect(result).toBe('')
    })
  })

  describe('embedItem', () => {
    it('generates embedding from item fields', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: mockEmbedding }],
            usage: { prompt_tokens: 10, total_tokens: 10 },
          }),
      })

      const { embedItem } = await import('./embeddings')
      const result = await embedItem({
        title: 'Test',
        summary: 'Summary',
        tags: ['tag'],
      })

      expect(result).not.toBeNull()
      expect(result?.embedding).toHaveLength(1536)
    })

    it('returns null when text is empty', async () => {
      const { embedItem } = await import('./embeddings')
      const result = await embedItem({
        title: null,
        summary: null,
        tags: null,
      })

      expect(result).toBeNull()
    })
  })
})
