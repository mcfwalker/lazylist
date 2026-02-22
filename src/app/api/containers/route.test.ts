import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'

const TEST_USER_ID = 'test-user-uuid'

function createRequest(): NextRequest {
  return new NextRequest('http://localhost/api/containers', {
    method: 'GET',
    headers: { 'x-user-id': TEST_USER_ID },
  })
}

function createSupabaseMock(defaultResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null }) {
  let result = defaultResult

  const mock = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn((resolve: (value: typeof result) => void) => {
      resolve(result)
      return Promise.resolve(result)
    }),
    setResult: (newResult: typeof result) => {
      result = newResult
    },
  }

  mock.from.mockReturnValue(mock)
  mock.select.mockReturnValue(mock)
  mock.eq.mockReturnValue(mock)
  mock.order.mockReturnValue(mock)

  return mock
}

describe('containers list API route', () => {
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

  it('returns 401 when user is not authenticated', async () => {
    const request = new NextRequest('http://localhost/api/containers', { method: 'GET' })
    const response = await GET(request)

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('returns containers sorted by item_count desc', async () => {
    mockQuery.setResult({
      data: [
        { id: '1', name: 'AI Tools', item_count: 5 },
        { id: '2', name: 'Dev Resources', item_count: 3 },
      ],
      error: null,
    })

    const response = await GET(createRequest())

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.containers).toHaveLength(2)
    expect(mockQuery.order).toHaveBeenCalledWith('item_count', { ascending: false })
  })

  it('filters by user_id', async () => {
    await GET(createRequest())

    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID)
  })

  it('returns empty array when no containers', async () => {
    mockQuery.setResult({ data: null, error: null })

    const response = await GET(createRequest())
    const data = await response.json()

    expect(data.containers).toEqual([])
  })

  it('returns 500 on database error', async () => {
    mockQuery.setResult({ data: null, error: { message: 'DB error' } })

    const response = await GET(createRequest())

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Failed to fetch containers')
  })
})
