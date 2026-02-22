import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, DELETE } from './route'

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase'

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth (Google OAuth)', () => {
    it('should return Google OAuth URL on success', async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
        error: null,
      })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOAuth: mockSignInWithOAuth },
      } as never)

      const response = await POST()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.url).toBe('https://accounts.google.com/o/oauth2/auth?...')
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
        })
      )
    })

    it('should return 500 when Supabase OAuth fails', async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({
        data: { url: null },
        error: new Error('OAuth error'),
      })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOAuth: mockSignInWithOAuth },
      } as never)

      const response = await POST()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to initiate login')
    })

    it('should return 500 when URL is missing from response', async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({
        data: { url: null },
        error: null,
      })
      vi.mocked(createServerClient).mockResolvedValue({
        auth: { signInWithOAuth: mockSignInWithOAuth },
      } as never)

      const response = await POST()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to initiate login')
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
