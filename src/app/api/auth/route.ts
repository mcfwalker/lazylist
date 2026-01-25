import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    }

    const correctPassword = process.env.SITE_PASSWORD

    if (password !== correctPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // Set auth cookie (same value we check in middleware)
    const response = NextResponse.json({ success: true })
    response.cookies.set('lazylist_auth', process.env.SITE_PASSWORD_HASH!, {
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
