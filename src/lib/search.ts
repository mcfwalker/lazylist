// Semantic search using pgvector

import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from './embeddings'

export interface SearchResult {
  id: string
  title: string | null
  summary: string | null
  domain: string | null
  content_type: string | null
  tags: string[] | null
  github_url: string | null
  source_url: string
  similarity: number
}

export interface SearchOptions {
  userId: string
  limit?: number
  threshold?: number // minimum similarity (0-1)
}

/**
 * Create a Supabase client for search operations
 */
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Search items semantically by natural language query
 * Uses the match_items RPC function with pgvector
 */
export async function semanticSearch(
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { userId, limit = 10, threshold = 0.5 } = options

  // Generate embedding for the query
  const embeddingResult = await generateEmbedding(query)
  if (!embeddingResult) {
    console.error('Failed to generate query embedding')
    return []
  }

  const supabase = getSupabaseClient()

  // Execute semantic search via RPC function
  const { data, error } = await supabase.rpc('match_items', {
    query_embedding: embeddingResult.embedding,
    match_user_id: userId,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('Semantic search error:', error)
    return []
  }

  return (data || []) as SearchResult[]
}

/**
 * Keyword search fallback using ILIKE
 */
export async function keywordSearch(
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { userId, limit = 10 } = options
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('items')
    .select('id, title, summary, domain, content_type, tags, github_url, source_url')
    .eq('user_id', userId)
    .eq('status', 'processed')
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .limit(limit)

  if (error) {
    console.error('Keyword search error:', error)
    return []
  }

  // Add default similarity score for keyword matches
  return (data || []).map(item => ({
    ...item,
    similarity: 0.5,
  }))
}

/**
 * Hybrid search: semantic first, fallback to keyword
 */
export async function hybridSearch(
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  // Try semantic search first
  const semanticResults = await semanticSearch(query, options)

  if (semanticResults.length > 0) {
    return semanticResults
  }

  // Fallback to keyword search
  return keywordSearch(query, options)
}
