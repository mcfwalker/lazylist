import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, DELETE } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/security', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}))

import { checkRateLimit } from '@/lib/security'
import { createServerClient } from '@/lib/supabase'

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth (login)', () => {
    it('should send magic link for valid email', async () => {
      const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOtp: mockSignInWithOtp },
      } as never)

      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('magic link')
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        })
      )
    })

    it('should normalize email to lowercase', async () => {
      const mockSignInWithOtp = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOtp: mockSignInWithOtp },
      } as never)

      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ email: '  TEST@Example.COM  ' }),
      })

      await POST(request)

      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        })
      )
    })

    it('should return 400 when email is missing', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Email required')
    })

    it('should return 429 when rate limited', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetIn: 60000 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.error).toContain('Too many attempts')
      expect(response.headers.get('Retry-After')).toBe('60')
    })

    it('should return 500 when Supabase auth fails', async () => {
      const mockSignInWithOtp = vi.fn().mockResolvedValue({
        error: new Error('Supabase error'),
      })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOtp: mockSignInWithOtp },
      } as never)

      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to send magic link')
    })

    it('should return 400 for invalid JSON body', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: 'invalid json',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('should extract IP from x-forwarded-for header', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetIn: 0 })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOtp: vi.fn().mockResolvedValue({ error: null }) },
      } as never)

      const request = new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      await POST(request)

      expect(checkRateLimit).toHaveBeenCalledWith('auth:192.168.1.1', 5, 15 * 60 * 1000)
    })
  })

  describe('DELETE /api/auth (logout)', () => {
    it('should sign out user and clear cookies', async () => {
      const mockSignOut = vi.fn().mockResolvedValue({})
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signOut: mockSignOut },
      } as never)

      const response = await DELETE()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockSignOut).toHaveBeenCalled()
    })
  })
})
