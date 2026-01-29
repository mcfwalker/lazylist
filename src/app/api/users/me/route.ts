/**
 * Current User API Route
 *
 * Returns basic info about the authenticated user.
 *
 * GET /api/users/me - Get current user info
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, is_admin')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    isAdmin: data.is_admin,
  })
}
