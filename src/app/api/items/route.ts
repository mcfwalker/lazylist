import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const domain = searchParams.get('domain')
  const contentType = searchParams.get('type')
  const status = searchParams.get('status')
  const search = searchParams.get('q')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')

  const supabase = createServerClient()

  let query = supabase
    .from('items')
    .select('*', { count: 'exact' })
    .order('captured_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (domain) {
    query = query.eq('domain', domain)
  }

  if (contentType) {
    query = query.eq('content_type', contentType)
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (search) {
    // Full text search on title, summary, and transcript
    query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  return NextResponse.json({
    items: data || [],
    total: count || 0,
  })
}
