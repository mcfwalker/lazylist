import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('interests', () => {
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

  describe('extractInterests', () => {
    it('extracts interests from item metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    topics: ['react-three-fiber', 'camera-controls'],
                    tools: ['three.js'],
                    people: [],
                    repos: ['pmndrs/drei'],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
      })

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'React Three Fiber Camera Controls',
        summary: 'A library for camera controls in R3F',
        tags: ['r3f', 'three.js', 'camera'],
        domain: 'vibe-coding',
      })

      expect(result).not.toBeNull()
      expect(result?.interests).toBeDefined()
      expect(result?.interests.length).toBeGreaterThan(0)
    })

    it('returns null when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'Test',
        summary: 'Test',
        tags: null,
        domain: null,
      })

      expect(result).toBeNull()
    })

    it('includes domain as an interest', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    topics: ['testing'],
                    tools: [],
                    people: [],
                    repos: [],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
      })

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'Test Item',
        summary: 'Testing something',
        tags: null,
        domain: 'ai-filmmaking',
      })

      expect(result?.interests.some(i => i.type === 'domain' && i.value === 'ai-filmmaking')).toBe(true)
    })

    it('handles markdown-wrapped JSON in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '```json\n{"topics": ["test"], "tools": [], "people": [], "repos": []}\n```',
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
      })

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'Test',
        summary: 'Test',
        tags: null,
        domain: null,
      })

      expect(result?.interests.some(i => i.value === 'test')).toBe(true)
    })

    it('returns null on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'Test',
        summary: 'Test',
        tags: null,
        domain: null,
      })

      expect(result).toBeNull()
    })
  })

  describe('calculateWeight', () => {
    it('returns higher weight for recent occurrences', async () => {
      const { calculateWeight } = await import('./interests')

      const recent = calculateWeight(5, new Date())
      const old = calculateWeight(5, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

      expect(recent).toBeGreaterThan(old)
    })

    it('returns higher weight for more occurrences', async () => {
      const { calculateWeight } = await import('./interests')
      const now = new Date()

      const manyOccurrences = calculateWeight(10, now)
      const fewOccurrences = calculateWeight(2, now)

      expect(manyOccurrences).toBeGreaterThan(fewOccurrences)
    })

    it('caps weight at 1.0', async () => {
      const { calculateWeight } = await import('./interests')

      const weight = calculateWeight(1000, new Date())

      expect(weight).toBeLessThanOrEqual(1.0)
    })

    it('returns reasonable weight for single occurrence', async () => {
      const { calculateWeight } = await import('./interests')

      const weight = calculateWeight(1, new Date())

      expect(weight).toBeGreaterThan(0.4)
      expect(weight).toBeLessThanOrEqual(0.6)
    })
  })
})
