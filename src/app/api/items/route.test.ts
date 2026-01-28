import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'

const TEST_USER_ID = 'test-user-uuid'

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/items')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'x-user-id': TEST_USER_ID },
  })
}

// Create a chainable mock that also works as a promise
function createSupabaseMock(defaultResult: { data: unknown[] | null; error: { message: string } | null; count: number | null } = { data: [{ id: '1', title: 'Test Item' }], error: null, count: 1 }) {
  let result = defaultResult

  const mock = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    then: vi.fn((resolve: (value: typeof result) => void) => {
      resolve(result)
      return Promise.resolve(result)
    }),
    setResult: (newResult: typeof result) => {
      result = newResult
    },
  }

  // Make all chainable methods return the mock
  mock.from.mockReturnValue(mock)
  mock.select.mockReturnValue(mock)
  mock.eq.mockReturnValue(mock)
  mock.or.mockReturnValue(mock)
  mock.order.mockReturnValue(mock)
  mock.range.mockReturnValue(mock)

  return mock
}

describe('items API route', () => {
  let mockQuery: ReturnType<typeof createSupabaseMock>

  beforeEach(() => {
    mockQuery = createSupabaseMock()

    vi.mocked(createServiceClient).mockReturnValue(
      mockQuery as unknown as ReturnType<typeof createServiceClient>
    )

    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      const request = new NextRequest('http://localhost/api/items', {
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

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID)
    })

    it('filters by domain when provided', async () => {
      const request = createRequest({ domain: 'ai-ml' })

      await GET(request)

      expect(mockQuery.eq).toHaveBeenCalledWith('domain', 'ai-ml')
    })

    it('filters by content type when provided', async () => {
      const request = createRequest({ type: 'tutorial' })

      await GET(request)

      expect(mockQuery.eq).toHaveBeenCalledWith('content_type', 'tutorial')
    })

    it('filters by status when provided', async () => {
      const request = createRequest({ status: 'processed' })

      await GET(request)

      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'processed')
    })

    it('applies search filter when provided', async () => {
      const request = createRequest({ q: 'test search' })

      await GET(request)

      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining('title.ilike.%test search%')
      )
    })

    it('applies multiple filters together', async () => {
      const request = createRequest({
        domain: 'ai-ml',
        type: 'tutorial',
        status: 'processed',
      })

      await GET(request)

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID)
      expect(mockQuery.eq).toHaveBeenCalledWith('domain', 'ai-ml')
      expect(mockQuery.eq).toHaveBeenCalledWith('content_type', 'tutorial')
      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'processed')
    })
  })

  describe('pagination', () => {
    it('uses default limit of 50', async () => {
      const request = createRequest()

      await GET(request)

      expect(mockQuery.range).toHaveBeenCalledWith(0, 49)
    })

    it('respects custom limit', async () => {
      const request = createRequest({ limit: '25' })

      await GET(request)

      expect(mockQuery.range).toHaveBeenCalledWith(0, 24)
    })

    it('caps limit at 100', async () => {
      const request = createRequest({ limit: '500' })

      await GET(request)

      expect(mockQuery.range).toHaveBeenCalledWith(0, 99)
    })

    it('respects offset parameter', async () => {
      const request = createRequest({ offset: '50' })

      await GET(request)

      expect(mockQuery.range).toHaveBeenCalledWith(50, 99)
    })

    it('combines offset and limit correctly', async () => {
      const request = createRequest({ offset: '20', limit: '10' })

      await GET(request)

      expect(mockQuery.range).toHaveBeenCalledWith(20, 29)
    })
  })

  describe('response format', () => {
    it('returns items array and total count', async () => {
      mockQuery.setResult({
        data: [
          { id: '1', title: 'Item 1' },
          { id: '2', title: 'Item 2' },
        ],
        error: null,
        count: 10,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.items).toHaveLength(2)
      expect(data.total).toBe(10)
    })

    it('returns empty array when no items', async () => {
      mockQuery.setResult({
        data: null,
        error: null,
        count: 0,
      })

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data.items).toEqual([])
      expect(data.total).toBe(0)
    })
  })

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      mockQuery.setResult({
        data: null,
        error: { message: 'DB error' },
        count: null,
      })

      const request = createRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch items')
    })
  })

  describe('ordering', () => {
    it('orders by captured_at descending', async () => {
      const request = createRequest()

      await GET(request)

      expect(mockQuery.order).toHaveBeenCalledWith('captured_at', {
        ascending: false,
      })
    })
  })
})
