import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { timezone } = await request.json()

  // Validate timezone is a valid IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
  } catch {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update({ timezone })
    .eq('id', userId)

  if (error) {
    console.error('Failed to update timezone:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
