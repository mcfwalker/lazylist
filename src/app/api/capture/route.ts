import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { detectSourceType } from '@/lib/processors/detect'
import { processItem } from '@/lib/processors'

// Validate auth token
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)
  return token === process.env.API_SECRET_KEY
}

export async function POST(request: NextRequest) {
  // Auth check
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Check for recent duplicate (same URL in last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('source_url', parsedUrl.href)
      .gte('captured_at', oneDayAgo)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({
        id: existing[0].id,
        status: 'duplicate',
        message: 'Already captured recently',
      })
    }

    // Detect source type
    const sourceType = detectSourceType(parsedUrl.href)

    // Insert the item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        source_url: parsedUrl.href,
        source_type: sourceType,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error || !item) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: 'Failed to capture' }, { status: 500 })
    }

    // Trigger async processing (don't await)
    processItem(item.id).catch((err) => {
      console.error('Background processing error:', err)
    })

    return NextResponse.json({
      id: item.id,
      status: 'captured',
      source_type: sourceType,
    })

  } catch (error) {
    console.error('Capture error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
