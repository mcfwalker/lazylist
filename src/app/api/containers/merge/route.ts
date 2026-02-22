import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'
import { executeMerge } from '@/lib/containers'

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { source_id, target_id } = body

    if (!source_id || !target_id) {
      return NextResponse.json({ error: 'source_id and target_id are required' }, { status: 400 })
    }

    if (source_id === target_id) {
      return NextResponse.json({ error: 'Cannot merge a container into itself' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify both containers belong to user
    const { data: containers, error: fetchError } = await supabase
      .from('containers')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', [source_id, target_id])

    if (fetchError || !containers || containers.length !== 2) {
      return NextResponse.json({ error: 'One or both containers not found' }, { status: 404 })
    }

    const result = await executeMerge(supabase, {
      source: source_id,
      target: target_id,
      reason: 'Manual merge via UI',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Merge failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      itemsMoved: result.itemsMoved,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
