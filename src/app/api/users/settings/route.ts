/**
 * User Settings API Route
 *
 * Manages user preferences for digest delivery.
 *
 * GET /api/users/settings - Get current settings
 * PATCH /api/users/settings - Update settings
 *
 * Settings:
 * - digest_frequency: string - How often to receive digests (daily/weekly/never)
 * - digest_day: number - Day of week for weekly digest (0=Sun, 6=Sat)
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
 * @returns { digest_frequency, digest_day, digest_time, timezone }
 */
export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('digest_frequency, digest_day, digest_time, timezone')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    digest_frequency: data.digest_frequency ?? 'daily',
    digest_day: data.digest_day ?? 1,
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
  const allowed = ['digest_frequency', 'digest_day', 'digest_time', 'timezone']
  const filtered: Record<string, unknown> = {}

  for (const key of allowed) {
    if (key in updates) {
      if (key === 'timezone') {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: updates[key] })
        } catch {
          return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
        }
      }
      if (key === 'digest_time' && !/^\d{2}:\d{2}$/.test(updates[key])) {
        return NextResponse.json(
          { error: 'Invalid time format' },
          { status: 400 }
        )
      }
      if (key === 'digest_frequency' && !['daily', 'weekly', 'never'].includes(updates[key])) {
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 })
      }
      if (key === 'digest_day') {
        const day = Number(updates[key])
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          return NextResponse.json({ error: 'Invalid day (0-6)' }, { status: 400 })
        }
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
