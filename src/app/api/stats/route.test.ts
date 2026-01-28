import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'

const TEST_USER_ID = 'test-user-uuid'

function createRequest(): NextRequest {
  return new NextRequest('http://localhost/api/stats', {
    method: 'GET',
    headers: { 'x-user-id': TEST_USER_ID },
  })
}

describe('stats API route', () => {
  let itemsQueryResult: { data: unknown[] | null; error: { message: string } | null }
  let digestsQueryResult: { data: unknown[] | null; error: { message: string } | null }
  let currentTable: string

  beforeEach(() => {
    itemsQueryResult = { data: [], error: null }
    digestsQueryResult = { data: [], error: null }
    currentTable = ''

    const mockSupabase = {
      from: vi.fn((table: string) => {
        currentTable = table
        return mockSupabase
      }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn(() => {
        if (currentTable === 'items') {
          return itemsQueryResult
        }
        return digestsQueryResult
      }),
    }

    vi.mocked(createServiceClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof createServiceClient>
    )

    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      const request = new NextRequest('http://localhost/api/stats', {
        method: 'GET',
      })

      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('proceeds when user is authenticated', async () => {
      const request = createRequest()

      const response = await GET(request)

      expect(response.status).toBe(200)
    })
  })

  describe('cost calculation', () => {
    it('calculates total cost from items (openai, grok, repo_extraction)', async () => {
      itemsQueryResult = {
        data: [
          { openai_cost: 0.01, grok_cost: 0.05, repo_extraction_cost: 0.02 },
          { openai_cost: 0.02, grok_cost: null, repo_extraction_cost: null },
          { openai_cost: null, grok_cost: 0.03, repo_extraction_cost: 0.01 },
        ],
        error: null,
      }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      // 0.01+0.05+0.02 + 0.02+0+0 + 0+0.03+0.01 = 0.14
      expect(data.totalCost).toBeCloseTo(0.14, 5)
    })

    it('includes digest costs in total', async () => {
      itemsQueryResult = {
        data: [{ openai_cost: 0.10, grok_cost: null, repo_extraction_cost: null }],
        error: null,
      }
      digestsQueryResult = {
        data: [
          { anthropic_cost: 0.05, tts_cost: 0.02 },
          { anthropic_cost: 0.03, tts_cost: null },
        ],
        error: null,
      }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      // Items: 0.10, Digests: 0.05+0.02 + 0.03+0 = 0.10
      // Total: 0.10 + 0.10 = 0.20
      expect(data.totalCost).toBeCloseTo(0.20, 5)
    })

    it('calculates average cost per entry (items only)', async () => {
      itemsQueryResult = {
        data: [
          { openai_cost: 0.10, grok_cost: null, repo_extraction_cost: null },
          { openai_cost: 0.20, grok_cost: null, repo_extraction_cost: null },
        ],
        error: null,
      }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.avgCost).toBeCloseTo(0.15, 5)
    })

    it('handles null costs correctly', async () => {
      itemsQueryResult = {
        data: [
          { openai_cost: null, grok_cost: null, repo_extraction_cost: null },
          { openai_cost: 0.05, grok_cost: null, repo_extraction_cost: null },
        ],
        error: null,
      }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.totalCost).toBeCloseTo(0.05, 5)
      expect(data.entryCount).toBe(2)
    })

    it('returns zero average when no entries', async () => {
      itemsQueryResult = { data: [], error: null }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.avgCost).toBe(0)
      expect(data.totalCost).toBe(0)
    })
  })

  describe('response format', () => {
    it('returns all required fields', async () => {
      itemsQueryResult = {
        data: [{ openai_cost: 0.01, grok_cost: 0.02, repo_extraction_cost: null }],
        error: null,
      }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('entryCount')
      expect(data).toHaveProperty('totalCost')
      expect(data).toHaveProperty('avgCost')
    })

    it('entryCount matches number of items returned', async () => {
      itemsQueryResult = {
        data: [
          { openai_cost: 0.01, grok_cost: null, repo_extraction_cost: null },
          { openai_cost: 0.02, grok_cost: null, repo_extraction_cost: null },
          { openai_cost: 0.03, grok_cost: null, repo_extraction_cost: null },
        ],
        error: null,
      }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.entryCount).toBe(3)
    })
  })

  describe('error handling', () => {
    it('returns 500 on items database error', async () => {
      itemsQueryResult = { data: null, error: { message: 'DB error' } }

      const request = createRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch stats')
    })

    it('returns 500 on digests database error', async () => {
      itemsQueryResult = { data: [], error: null }
      digestsQueryResult = { data: null, error: { message: 'DB error' } }

      const request = createRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch stats')
    })

    it('handles null items data gracefully', async () => {
      itemsQueryResult = { data: null, error: null }
      digestsQueryResult = { data: [], error: null }

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.entryCount).toBe(0)
      expect(data.totalCost).toBe(0)
    })
  })
})
