/**
 * User Settings API Route
 *
 * Manages user preferences for digest delivery.
 *
 * GET /api/users/settings - Get current settings
 * PATCH /api/users/settings - Update settings
 *
 * Settings:
 * - digest_enabled: boolean - Whether to receive daily digests
 * - digest_time: string - Time to deliver digest (HH:MM format)
 * - timezone: string - IANA timezone for digest scheduling
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

/**
 * Get current user settings.
 *
 * @param request - Contains auth header
 * @returns { digest_enabled, digest_time, timezone }
 */
export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('digest_enabled, digest_time, timezone')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    digest_enabled: data.digest_enabled ?? true,
    digest_time: data.digest_time ?? '07:00',
    timezone: data.timezone ?? 'America/Los_Angeles',
  })
}

/**
 * Update user settings.
 * Validates timezone against IANA database and time format (HH:MM).
 *
 * @param request - JSON body with settings to update
 * @returns Success confirmation or validation error
 */
export async function PATCH(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const updates = await request.json()

  // Validate updates
  const allowed = ['digest_enabled', 'digest_time', 'timezone']
  const filtered: Record<string, unknown> = {}

  for (const key of allowed) {
    if (key in updates) {
      // Validate timezone
      if (key === 'timezone') {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: updates[key] })
        } catch {
          return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
        }
      }
      // Validate time format (HH:MM)
      if (key === 'digest_time' && !/^\d{2}:\d{2}$/.test(updates[key])) {
        return NextResponse.json(
          { error: 'Invalid time format' },
          { status: 400 }
        )
      }
      filtered[key] = updates[key]
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'No valid updates' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update(filtered)
    .eq('id', userId)

  if (error) {
    console.error('Failed to update settings:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
