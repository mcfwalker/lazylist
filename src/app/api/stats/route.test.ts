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
  let mockSupabase: {
    from: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    gte: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      or: vi.fn(),
    }

    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.gte.mockReturnValue(mockSupabase)
    mockSupabase.or.mockReturnValue({
      data: [],
      error: null,
    })

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

  describe('query building', () => {
    it('filters by user_id', async () => {
      const request = createRequest()

      await GET(request)

      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID)
    })

    it('filters for current month', async () => {
      const request = createRequest()

      await GET(request)

      expect(mockSupabase.gte).toHaveBeenCalledWith(
        'captured_at',
        expect.stringMatching(/^\d{4}-\d{2}-01T/)
      )
    })

    it('filters for items with costs', async () => {
      const request = createRequest()

      await GET(request)

      expect(mockSupabase.or).toHaveBeenCalledWith(
        'openai_cost.not.is.null,grok_cost.not.is.null'
      )
    })
  })

  describe('cost calculation', () => {
    it('calculates total cost from openai_cost and grok_cost', async () => {
      mockSupabase.or.mockReturnValue({
        data: [
          { openai_cost: 0.01, grok_cost: 0.05 },
          { openai_cost: 0.02, grok_cost: null },
          { openai_cost: null, grok_cost: 0.03 },
        ],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.totalCost).toBeCloseTo(0.11, 5)
    })

    it('calculates average cost per entry', async () => {
      mockSupabase.or.mockReturnValue({
        data: [
          { openai_cost: 0.10, grok_cost: null },
          { openai_cost: 0.20, grok_cost: null },
        ],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.avgCost).toBeCloseTo(0.15, 5)
    })

    it('handles null costs correctly', async () => {
      mockSupabase.or.mockReturnValue({
        data: [
          { openai_cost: null, grok_cost: null },
          { openai_cost: 0.05, grok_cost: null },
        ],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.totalCost).toBeCloseTo(0.05, 5)
      expect(data.entryCount).toBe(2)
    })

    it('returns zero average when no entries', async () => {
      mockSupabase.or.mockReturnValue({
        data: [],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.avgCost).toBe(0)
      expect(data.totalCost).toBe(0)
    })
  })

  describe('response format', () => {
    it('returns all required fields', async () => {
      mockSupabase.or.mockReturnValue({
        data: [{ openai_cost: 0.01, grok_cost: 0.02 }],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('daysElapsed')
      expect(data).toHaveProperty('entryCount')
      expect(data).toHaveProperty('totalCost')
      expect(data).toHaveProperty('avgCost')
    })

    it('daysElapsed equals current day of month', async () => {
      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      const today = new Date()
      expect(data.daysElapsed).toBe(today.getDate())
    })

    it('entryCount matches number of items returned', async () => {
      mockSupabase.or.mockReturnValue({
        data: [
          { openai_cost: 0.01, grok_cost: null },
          { openai_cost: 0.02, grok_cost: null },
          { openai_cost: 0.03, grok_cost: null },
        ],
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.entryCount).toBe(3)
    })
  })

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      mockSupabase.or.mockReturnValue({
        data: null,
        error: { message: 'DB error' },
      })

      const request = createRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch stats')
    })

    it('handles null data gracefully', async () => {
      mockSupabase.or.mockReturnValue({
        data: null,
        error: null,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.entryCount).toBe(0)
      expect(data.totalCost).toBe(0)
    })
  })
})
