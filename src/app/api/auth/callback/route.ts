/**
 * Auth Callback Route
 *
 * Handles the redirect from Supabase OAuth authentication.
 * Exchanges the auth code for a session, enforces email allowlist,
 * and redirects to the app.
 *
 * GET /api/auth/callback?code=xxx - Exchange code for session
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const allowedEmails = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
              })
            } catch {
              // Can be ignored if middleware refreshes sessions.
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Enforce email allowlist
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.email || !allowedEmails.includes(user.email.toLowerCase())) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=not_allowed`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
