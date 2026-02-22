import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserId: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

describe('User Settings API Routes', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never)
  })

  describe('GET /api/users/settings', () => {
    it('should return user settings', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.single.mockResolvedValue({
        data: {
          digest_frequency: 'daily',
          digest_day: 1,
          digest_time: '08:00',
          timezone: 'America/New_York',
        },
        error: null,
      })

      const request = new NextRequest('http://localhost/api/users/settings')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        digest_frequency: 'daily',
        digest_day: 1,
        digest_time: '08:00',
        timezone: 'America/New_York',
      })
    })

    it('should return defaults for null values', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.single.mockResolvedValue({
        data: {
          digest_frequency: null,
          digest_day: null,
          digest_time: null,
          timezone: null,
        },
        error: null,
      })

      const request = new NextRequest('http://localhost/api/users/settings')
      const response = await GET(request)
      const data = await response.json()

      expect(data).toEqual({
        digest_frequency: 'daily',
        digest_day: 1,
        digest_time: '07:00',
        timezone: 'America/Los_Angeles',
      })
    })

    it('should return 401 for unauthenticated requests', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue(null)

      const request = new NextRequest('http://localhost/api/users/settings')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 404 when user not found', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Not found'),
      })

      const request = new NextRequest('http://localhost/api/users/settings')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('User not found')
    })
  })

  describe('PATCH /api/users/settings', () => {
    it('should update digest_frequency', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_frequency: 'weekly' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockSupabase.update).toHaveBeenCalledWith({ digest_frequency: 'weekly' })
    })

    it('should reject invalid digest_frequency', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_frequency: 'hourly' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid frequency')
    })

    it('should update digest_day with valid value', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_day: 5 }),
      })

      const response = await PATCH(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.update).toHaveBeenCalledWith({ digest_day: 5 })
    })

    it('should reject invalid digest_day', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_day: 7 }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid day (0-6)')
    })

    it('should update digest_time with valid format', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_time: '09:30' }),
      })

      const response = await PATCH(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.update).toHaveBeenCalledWith({ digest_time: '09:30' })
    })

    it('should reject invalid digest_time format', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_time: '9:30' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid time format')
    })

    it('should update timezone with valid IANA timezone', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ timezone: 'Europe/London' }),
      })

      const response = await PATCH(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.update).toHaveBeenCalledWith({ timezone: 'Europe/London' })
    })

    it('should reject invalid timezone', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ timezone: 'Invalid/Timezone' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid timezone')
    })

    it('should update multiple fields at once', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          digest_frequency: 'weekly',
          digest_day: 3,
          digest_time: '10:00',
          timezone: 'Asia/Tokyo',
        }),
      })

      const response = await PATCH(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.update).toHaveBeenCalledWith({
        digest_frequency: 'weekly',
        digest_day: 3,
        digest_time: '10:00',
        timezone: 'Asia/Tokyo',
      })
    })

    it('should ignore unknown fields', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          digest_frequency: 'daily',
          unknown_field: 'ignored',
        }),
      })

      const response = await PATCH(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.update).toHaveBeenCalledWith({ digest_frequency: 'daily' })
    })

    it('should return 400 when no valid updates provided', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ unknown_field: 'value' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('No valid updates')
    })

    it('should return 401 for unauthenticated requests', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue(null)

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_frequency: 'daily' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 500 on database error', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: new Error('DB error') })

      const request = new NextRequest('http://localhost/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ digest_frequency: 'daily' }),
      })

      const response = await PATCH(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to update')
    })
  })
})
