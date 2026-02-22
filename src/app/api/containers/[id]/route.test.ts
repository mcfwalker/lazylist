import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PATCH, DELETE } from './route'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'

const TEST_USER_ID = 'test-user-uuid'
const TEST_CONTAINER_ID = 'container-uuid'

function createParams(id: string = TEST_CONTAINER_ID) {
  return { params: Promise.resolve({ id }) }
}

function createRequest(method: string = 'GET', body?: Record<string, unknown>, searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/containers/' + TEST_CONTAINER_ID)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  const init: RequestInit = {
    method,
    headers: { 'x-user-id': TEST_USER_ID },
  }
  if (body) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  return new NextRequest(url, init)
}

function createSupabaseMock() {
  let singleResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
  let chainResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }

  const mock = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    in: vi.fn(),
    then: vi.fn((resolve: (value: typeof chainResult) => void) => {
      resolve(chainResult)
      return Promise.resolve(chainResult)
    }),
    setSingleResult: (result: typeof singleResult) => {
      singleResult = result
      mock.single.mockResolvedValue(result)
    },
    setChainResult: (result: typeof chainResult) => {
      chainResult = result
    },
  }

  mock.from.mockReturnValue(mock)
  mock.select.mockReturnValue(mock)
  mock.eq.mockReturnValue(mock)
  mock.update.mockReturnValue(mock)
  mock.delete.mockReturnValue(mock)
  mock.in.mockReturnValue(mock)
  mock.single.mockResolvedValue(singleResult)

  return mock
}

describe('container [id] API routes', () => {
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

  describe('GET', () => {
    it('returns 401 when not authenticated', async () => {
      const request = new NextRequest('http://localhost/api/containers/id', { method: 'GET' })
      const response = await GET(request, createParams())

      expect(response.status).toBe(401)
    })

    it('returns container details', async () => {
      const container = { id: TEST_CONTAINER_ID, name: 'AI Tools', item_count: 5 }
      mockQuery.setSingleResult({ data: container, error: null })

      const response = await GET(createRequest(), createParams())

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe('AI Tools')
    })

    it('returns 404 when container not found', async () => {
      mockQuery.setSingleResult({ data: null, error: { message: 'not found' } })

      const response = await GET(createRequest(), createParams())

      expect(response.status).toBe(404)
    })
  })

  describe('PATCH', () => {
    it('returns 401 when not authenticated', async () => {
      const request = new NextRequest('http://localhost/api/containers/id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
      })
      const response = await PATCH(request, createParams())

      expect(response.status).toBe(401)
    })

    it('updates container name', async () => {
      const updated = { id: TEST_CONTAINER_ID, name: 'New Name' }
      mockQuery.single.mockResolvedValue({ data: updated, error: null })

      const response = await PATCH(
        createRequest('PATCH', { name: 'New Name' }),
        createParams()
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe('New Name')
    })

    it('rejects updates with no valid fields', async () => {
      const response = await PATCH(
        createRequest('PATCH', { invalid_field: 'value' }),
        createParams()
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('No valid fields to update')
    })

    it('only allows name and description fields', async () => {
      mockQuery.single.mockResolvedValue({ data: { id: TEST_CONTAINER_ID }, error: null })

      await PATCH(
        createRequest('PATCH', { name: 'New', item_count: 999 }),
        createParams()
      )

      expect(mockQuery.update).toHaveBeenCalledWith({ name: 'New' })
    })
  })

  describe('DELETE', () => {
    it('returns 401 when not authenticated', async () => {
      const request = new NextRequest('http://localhost/api/containers/id', { method: 'DELETE' })
      const response = await DELETE(request, createParams())

      expect(response.status).toBe(401)
    })

    it('deletes empty container', async () => {
      mockQuery.single.mockResolvedValue({
        data: { id: TEST_CONTAINER_ID, item_count: 0 },
        error: null,
      })
      mockQuery.setChainResult({ data: null, error: null })

      const response = await DELETE(createRequest('DELETE'), createParams())

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('returns 409 for non-empty container without force', async () => {
      mockQuery.single.mockResolvedValue({
        data: { id: TEST_CONTAINER_ID, item_count: 5 },
        error: null,
      })

      const response = await DELETE(createRequest('DELETE'), createParams())

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain('force=true')
    })

    it('deletes non-empty container with force=true', async () => {
      mockQuery.single.mockResolvedValue({
        data: { id: TEST_CONTAINER_ID, item_count: 5 },
        error: null,
      })
      mockQuery.setChainResult({ data: null, error: null })

      const response = await DELETE(
        createRequest('DELETE', undefined, { force: 'true' }),
        createParams()
      )

      expect(response.status).toBe(200)
    })

    it('returns 404 when container not found', async () => {
      mockQuery.single.mockResolvedValue({ data: null, error: { message: 'not found' } })

      const response = await DELETE(createRequest('DELETE'), createParams())

      expect(response.status).toBe(404)
    })
  })
})
