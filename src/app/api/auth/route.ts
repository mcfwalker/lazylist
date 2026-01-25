import { NextRequest, NextResponse } from 'next/server'
import { secureCompare, checkRateLimit, generateSessionToken } from '@/lib/security'

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
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    }

    const correctPassword = process.env.SITE_PASSWORD || ''

    // Timing-safe password comparison
    if (!secureCompare(password, correctPassword)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Generate secure session token with 30-day expiration
    const sessionToken = generateSessionToken(30 * 24 * 60 * 60 * 1000)

    const response = NextResponse.json({ success: true })
    response.cookies.set('lazylist_auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  // Logout - clear the cookie
  const response = NextResponse.json({ success: true })
  response.cookies.delete('lazylist_auth')
  return response
}
