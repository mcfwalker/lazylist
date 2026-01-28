import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
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

describe('Timezone API Route', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never)
  })

  describe('POST /api/users/timezone', () => {
    it('should update timezone with valid IANA timezone', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: 'America/New_York' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockSupabase.update).toHaveBeenCalledWith({ timezone: 'America/New_York' })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'user-123')
    })

    it('should accept various IANA timezones', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: null })

      const timezones = [
        'Europe/London',
        'Asia/Tokyo',
        'Australia/Sydney',
        'Pacific/Auckland',
        'America/Los_Angeles',
        'UTC',
      ]

      for (const timezone of timezones) {
        const request = new NextRequest('http://localhost/api/users/timezone', {
          method: 'POST',
          body: JSON.stringify({ timezone }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
      }
    })

    it('should reject invalid timezone', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: 'Invalid/Timezone' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid timezone')
    })

    it('should reject empty timezone', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: '' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should reject non-IANA format', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: 'NotA/Timezone123' }), // Clearly invalid
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should return 401 for unauthenticated requests', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue(null)

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: 'America/New_York' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 500 on database error', async () => {
      vi.mocked(getCurrentUserId).mockReturnValue('user-123')
      mockSupabase.eq.mockResolvedValue({ error: new Error('DB error') })

      const request = new NextRequest('http://localhost/api/users/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: 'America/New_York' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to update')
    })
  })
})
