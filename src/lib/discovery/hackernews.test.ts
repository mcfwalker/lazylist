import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('hackernews', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('searchHN', () => {
    it('searches HN Algolia API and returns results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [
              {
                objectID: '123',
                title: 'Show HN: React Three Fiber tricks',
                url: 'https://example.com/r3f',
                points: 150,
                num_comments: 45,
                created_at: '2026-01-30T10:00:00Z',
              },
            ],
          }),
      })

      const { searchHN } = await import('./hackernews')
      const results = await searchHN('react three fiber', { days: 7 })

      expect(results.length).toBe(1)
      expect(results[0].title).toContain('React Three Fiber')
      expect(results[0].points).toBe(150)
      expect(results[0].hnUrl).toContain('123')
    })

    it('builds correct API URL with filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ hits: [] }),
      })

      const { searchHN } = await import('./hackernews')
      await searchHN('test query', { days: 7, minPoints: 20, limit: 10 })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('hn.algolia.com/api/v1/search')
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('query=test+query')
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('tags=story')
      )
    })

    it('returns empty array on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const { searchHN } = await import('./hackernews')
      const results = await searchHN('test', {})

      expect(results).toEqual([])
    })

    it('handles missing URL gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [
              {
                objectID: '456',
                title: 'Ask HN: Best practices?',
                url: null, // Ask HN posts don't have external URLs
                points: 100,
                num_comments: 50,
                created_at: '2026-01-30T10:00:00Z',
              },
            ],
          }),
      })

      const { searchHN } = await import('./hackernews')
      const results = await searchHN('best practices', {})

      expect(results.length).toBe(1)
      expect(results[0].url).toBeNull()
      expect(results[0].hnUrl).toContain('456')
    })
  })

  describe('searchHNBatch', () => {
    it('searches multiple queries and returns map', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            hits: [{ objectID: '1', title: 'Result 1', url: 'http://a.com', points: 10, num_comments: 5, created_at: '2026-01-30T10:00:00Z' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            hits: [{ objectID: '2', title: 'Result 2', url: 'http://b.com', points: 20, num_comments: 10, created_at: '2026-01-30T10:00:00Z' }],
          }),
        })

      const { searchHNBatch } = await import('./hackernews')
      const results = await searchHNBatch(['query1', 'query2'], {})

      expect(results.size).toBe(2)
      expect(results.get('query1')?.[0].title).toBe('Result 1')
      expect(results.get('query2')?.[0].title).toBe('Result 2')
    })
  })
})
