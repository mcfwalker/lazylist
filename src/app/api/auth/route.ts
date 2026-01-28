/**
 * Authentication API Route
 *
 * Handles magic link authentication via Supabase Auth.
 *
 * POST /api/auth - Send magic link email
 * DELETE /api/auth - Logout (clear session)
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security'
import { createServerClient } from '@/lib/supabase'

/**
 * Send a magic link to the user's email for passwordless authentication.
 * Rate limited to 5 attempts per 15 minutes per IP address.
 *
 * @param request - Must contain JSON body with { email: string }
 * @returns Success message or error
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const rateLimit = checkRateLimit(`auth:${ip}`, 5, 15 * 60 * 1000) // 5 attempts per 15 min

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000))
        }
      }
    )
  }

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // Send magic link via Supabase Auth
    const supabase = await createServerClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      },
    })

    if (error) {
      console.error('Magic link error:', error)
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Check your email for the magic link' })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

/**
 * Sign out the current user, clearing their session.
 *
 * @returns Success confirmation
 */
export async function DELETE() {
  // Logout - sign out from Supabase Auth
  const supabase = await createServerClient()
  await supabase.auth.signOut()

  const response = NextResponse.json({ success: true })
  // Clear any legacy cookies
  response.cookies.delete('mollymemo_auth')
  return response
}
