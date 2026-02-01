# MollyMemo v2: Interest Graph Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform MollyMemo from passive capture to proactive knowledge assistant with semantic search and personalized discovery, centered on an evolving interest graph.

**Architecture:** Interest graph stored in `user_interests` table, updated on each capture. Items get embeddings via pgvector for semantic recall. Discovery cron searches external sources (HN, Reddit) based on top interests, filters results by relevance, and surfaces via real-time pings or daily digest.

**Tech Stack:** Supabase pgvector, OpenAI text-embedding-3-small, Inngest crons, HN Algolia API (phase 1)

---

## Overview

### The Three Capabilities

1. **Semantic Recall** — "that reddit scraping thing" finds items even without keyword match
2. **Interest Graph** — Structured representation of what the user cares about, evolving with each capture
3. **Proactive Discovery** — Molly searches HN/Reddit based on interests, surfaces relevant finds

### Data Flow

```
CAPTURE                    INTEREST GRAPH                 DISCOVERY
   │                            │                             │
   ▼                            ▼                             ▼
┌─────────┐              ┌─────────────┐              ┌─────────────┐
│ Telegram│──embed───────│user_interests│──queries────│ HN Algolia  │
│ webhook │──extract─────│  table      │              │ Reddit API  │
└─────────┘              └──────┬──────┘              └──────┬──────┘
   │                            │                            │
   │                            │ weights                    │ results
   ▼                            ▼                            ▼
┌─────────┐              ┌─────────────┐              ┌─────────────┐
│ items   │◄─────────────│ Relevance   │◄─────────────│ memos table │
│ (embed) │  similarity  │ filtering   │  discovered  │ (pending)   │
└─────────┘              └─────────────┘              └─────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              ┌──────────┐           ┌──────────┐
              │ Ping     │           │ Digest   │
              │ (high)   │           │ (batch)  │
              └──────────┘           └──────────┘
```

---

## Phase 1: Embeddings Foundation

Enable semantic search on existing items.

### Task 1.1: Enable pgvector Extension

**Files:**
- Create: `supabase/migrations/20260131_enable_pgvector.sql`

**Step 1: Create migration file**

```sql
-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Comment for documentation
COMMENT ON COLUMN items.embedding IS 'OpenAI text-embedding-3-small vector for semantic search';
```

**Step 2: Apply migration via Supabase MCP**

Run: `mcp__supabase-mcfw__apply_migration` with:
- project_id: `uygkxicupbvnfdcymyge`
- name: `enable_pgvector`
- query: (the SQL above)

**Step 3: Verify migration**

Run: `mcp__supabase-mcfw__list_tables` and confirm `embedding` column exists on `items`.

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: enable pgvector and add embedding column to items"
```

---

### Task 1.2: Create Embedding Service

**Files:**
- Create: `src/lib/embeddings.ts`
- Create: `src/lib/embeddings.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('embeddings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  describe('generateEmbedding', () => {
    it('returns embedding vector for text input', async () => {
      const mockEmbedding = Array(1536).fill(0.1)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
          usage: { prompt_tokens: 10, total_tokens: 10 }
        })
      })

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).not.toBeNull()
      expect(result?.embedding).toHaveLength(1536)
      expect(result?.cost).toBeGreaterThan(0)
    })

    it('returns null when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY

      // Re-import to pick up env change
      vi.resetModules()
      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).toBeNull()
    })

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const { generateEmbedding } = await import('./embeddings')
      const result = await generateEmbedding('test text')

      expect(result).toBeNull()
    })
  })

  describe('buildEmbeddingText', () => {
    it('combines title, summary, and tags', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: 'Test Title',
        summary: 'Test summary here',
        tags: ['tag1', 'tag2']
      })

      expect(result).toBe('Test Title\n\nTest summary here\n\nTags: tag1, tag2')
    })

    it('handles missing fields gracefully', async () => {
      const { buildEmbeddingText } = await import('./embeddings')
      const result = buildEmbeddingText({
        title: 'Just Title',
        summary: null,
        tags: null
      })

      expect(result).toBe('Just Title')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/embeddings.test.ts`

Expected: FAIL with "Cannot find module './embeddings'"

**Step 3: Write minimal implementation**

```typescript
// src/lib/embeddings.ts
// Embedding service using OpenAI text-embedding-3-small

// Pricing: $0.02 per 1M tokens
const EMBEDDING_PRICE_PER_MILLION = 0.02

export interface EmbeddingResult {
  embedding: number[]
  cost: number
}

export interface EmbeddingInput {
  title: string | null
  summary: string | null
  tags: string[] | null
}

/**
 * Build text for embedding from item fields
 */
export function buildEmbeddingText(input: EmbeddingInput): string {
  const parts: string[] = []

  if (input.title) {
    parts.push(input.title)
  }

  if (input.summary) {
    parts.push(input.summary)
  }

  if (input.tags && input.tags.length > 0) {
    parts.push(`Tags: ${input.tags.join(', ')}`)
  }

  return parts.join('\n\n')
}

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`OpenAI Embeddings API error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    const embedding = data.data?.[0]?.embedding

    if (!embedding) {
      console.error('No embedding returned from OpenAI')
      return null
    }

    // Calculate cost
    const tokens = data.usage?.total_tokens || 0
    const cost = (tokens * EMBEDDING_PRICE_PER_MILLION) / 1_000_000

    return { embedding, cost }
  } catch (error) {
    console.error('Embedding generation error:', error)
    return null
  }
}

/**
 * Generate embedding for an item
 */
export async function embedItem(input: EmbeddingInput): Promise<EmbeddingResult | null> {
  const text = buildEmbeddingText(input)
  if (!text) {
    return null
  }
  return generateEmbedding(text)
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/embeddings.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/embeddings.ts src/lib/embeddings.test.ts
git commit -m "feat: add embedding service for semantic search"
```

---

### Task 1.3: Integrate Embeddings into Item Processing

**Files:**
- Modify: `src/inngest/functions/process-item.ts`

**Step 1: Write the failing test**

Add to existing test file or create integration test that verifies embedding is generated after classification.

```typescript
// Add to process-item tests or create new test
// For now, we'll verify by inspection after implementation
```

**Step 2: Modify process-item.ts**

Add after the "save-results" step (around line 375):

```typescript
// Step 7: Generate embedding (after save-results, before notify-user)
await step.run("generate-embedding", async () => {
  const { embedItem } = await import("@/lib/embeddings");

  // Fetch the processed item to get final title/summary/tags
  const { data: processed } = await supabase
    .from("items")
    .select("title, summary, tags")
    .eq("id", itemId)
    .single();

  if (!processed || !processed.title) {
    console.log("Skipping embedding - no title");
    return;
  }

  const result = await embedItem({
    title: processed.title,
    summary: processed.summary,
    tags: processed.tags,
  });

  if (result) {
    // Store embedding as array (Supabase pgvector accepts JSON array)
    await supabase
      .from("items")
      .update({
        embedding: result.embedding as unknown as string // pgvector accepts array
      })
      .eq("id", itemId);

    console.log(`Embedded item ${itemId}, cost: $${result.cost.toFixed(6)}`);
  }
});
```

**Step 3: Test manually**

Send a test link via Telegram and verify:
1. Item is processed
2. Embedding column is populated (check via Supabase dashboard or MCP)

**Step 4: Commit**

```bash
git add src/inngest/functions/process-item.ts
git commit -m "feat: generate embeddings for new items during processing"
```

---

### Task 1.4: Backfill Existing Items

**Files:**
- Create: `scripts/backfill-embeddings.ts`

**Step 1: Create backfill script**

```typescript
// scripts/backfill-embeddings.ts
// Run with: npx tsx scripts/backfill-embeddings.ts

import { createClient } from '@supabase/supabase-js'
import { embedItem } from '../src/lib/embeddings'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfillEmbeddings() {
  console.log('Fetching items without embeddings...')

  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, summary, tags')
    .is('embedding', null)
    .eq('status', 'processed')
    .order('captured_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch items:', error)
    process.exit(1)
  }

  console.log(`Found ${items?.length || 0} items to embed`)

  let totalCost = 0
  let successCount = 0

  for (const item of items || []) {
    if (!item.title) {
      console.log(`Skipping ${item.id} - no title`)
      continue
    }

    const result = await embedItem({
      title: item.title,
      summary: item.summary,
      tags: item.tags,
    })

    if (result) {
      const { error: updateError } = await supabase
        .from('items')
        .update({ embedding: result.embedding as unknown as string })
        .eq('id', item.id)

      if (updateError) {
        console.error(`Failed to update ${item.id}:`, updateError)
      } else {
        totalCost += result.cost
        successCount++
        console.log(`✓ ${item.title.slice(0, 50)}... ($${result.cost.toFixed(6)})`)
      }
    }

    // Rate limit: 3000 RPM for embeddings API, but be conservative
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`\nDone! Embedded ${successCount} items, total cost: $${totalCost.toFixed(4)}`)
}

backfillEmbeddings()
```

**Step 2: Run backfill**

```bash
cd /Users/matthewwalker/Development/mcfw/mollymemo
npx tsx scripts/backfill-embeddings.ts
```

**Step 3: Verify**

Query Supabase to confirm embeddings are populated:

```sql
SELECT COUNT(*) as total,
       COUNT(embedding) as with_embedding
FROM items
WHERE status = 'processed';
```

**Step 4: Commit**

```bash
git add scripts/backfill-embeddings.ts
git commit -m "feat: add backfill script for existing item embeddings"
```

---

### Task 1.5: Semantic Search Function

**Files:**
- Create: `src/lib/search.ts`
- Create: `src/lib/search.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('search', () => {
  describe('buildSearchQuery', () => {
    it('generates correct SQL for semantic search', async () => {
      const { buildSearchQuery } = await import('./search')
      const query = buildSearchQuery({
        embedding: Array(1536).fill(0.1),
        userId: 'user-123',
        limit: 10,
        threshold: 0.7
      })

      expect(query).toContain('1 - (embedding <=> ')
      expect(query).toContain('user_id')
      expect(query).toContain('LIMIT 10')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/search.test.ts`

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/lib/search.ts
// Semantic search using pgvector

import { createServiceClient } from './supabase'
import { generateEmbedding } from './embeddings'

export interface SearchResult {
  id: string
  title: string
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
 * Build SQL query for semantic search
 * Uses cosine similarity via pgvector
 */
export function buildSearchQuery(options: {
  embedding: number[]
  userId: string
  limit: number
  threshold: number
}): string {
  const { embedding, userId, limit, threshold } = options
  const embeddingStr = `'[${embedding.join(',')}]'`

  return `
    SELECT
      id, title, summary, domain, content_type, tags,
      github_url, source_url,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM items
    WHERE user_id = '${userId}'
      AND status = 'processed'
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${embeddingStr}::vector) > ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `
}

/**
 * Search items semantically by natural language query
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

  const supabase = createServiceClient()

  // Execute semantic search via raw SQL (pgvector)
  const sql = buildSearchQuery({
    embedding: embeddingResult.embedding,
    userId,
    limit,
    threshold
  })

  const { data, error } = await supabase.rpc('exec_sql', { query: sql })

  if (error) {
    // Fallback: use Supabase's built-in vector search if available
    console.error('Semantic search error:', error)
    return []
  }

  return data || []
}

/**
 * Hybrid search: semantic + keyword fallback
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
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('items')
    .select('id, title, summary, domain, content_type, tags, github_url, source_url')
    .eq('user_id', options.userId)
    .eq('status', 'processed')
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .limit(options.limit || 10)

  if (error) {
    console.error('Keyword search error:', error)
    return []
  }

  return (data || []).map(item => ({ ...item, similarity: 0.5 }))
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/search.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/search.ts src/lib/search.test.ts
git commit -m "feat: add semantic search with pgvector"
```

---

## Phase 2: Interest Graph

Build the structured interest representation.

### Task 2.1: Create Interest Tables

**Files:**
- Create: `supabase/migrations/20260131_interest_graph.sql`

**Step 1: Create migration**

```sql
-- Interest graph tables for MollyMemo v2

-- User interests extracted from captured items
CREATE TABLE IF NOT EXISTS user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Interest classification
  interest_type TEXT NOT NULL, -- 'topic', 'tool', 'domain', 'person', 'repo'
  value TEXT NOT NULL,         -- 'react-three-fiber', 'cursor', '@levelsio'

  -- Weighting
  weight DECIMAL DEFAULT 0.5,        -- 0.0 to 1.0, decays over time
  occurrence_count INT DEFAULT 1,    -- How many times seen

  -- Timestamps
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness per user
  UNIQUE(user_id, interest_type, value)
);

-- Indexes for fast lookups
CREATE INDEX idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX idx_user_interests_weight ON user_interests(user_id, weight DESC);
CREATE INDEX idx_user_interests_type ON user_interests(user_id, interest_type);

-- Memos table for Molly's discoveries
CREATE TABLE IF NOT EXISTS memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Source
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL, -- 'hackernews', 'reddit', 'twitter'
  external_id TEXT,              -- Platform-specific ID for deduping

  -- Content
  title TEXT,
  summary TEXT,

  -- Relevance
  relevance_score DECIMAL,           -- 0.0 to 1.0
  relevance_reason TEXT,             -- "Because you saved 3 R3F items"
  matched_interests JSONB,           -- Which interests triggered this

  -- Status
  status TEXT DEFAULT 'pending',     -- 'pending', 'pinged', 'shown', 'captured', 'dismissed'

  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  shown_at TIMESTAMPTZ,

  -- Prevent duplicates
  UNIQUE(user_id, source_url)
);

-- Indexes
CREATE INDEX idx_memos_user_status ON memos(user_id, status);
CREATE INDEX idx_memos_discovered ON memos(user_id, discovered_at DESC);

-- RLS policies
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- Users can only see their own interests
CREATE POLICY "Users can view own interests" ON user_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own memos" ON memos
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for backend processing)
CREATE POLICY "Service role full access to interests" ON user_interests
  FOR ALL USING (true);

CREATE POLICY "Service role full access to memos" ON memos
  FOR ALL USING (true);
```

**Step 2: Apply migration**

Run via Supabase MCP.

**Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_interests', 'memos');
```

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add user_interests and memos tables for interest graph"
```

---

### Task 2.2: Interest Extraction Service

**Files:**
- Create: `src/lib/interests.ts`
- Create: `src/lib/interests.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/interests.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('interests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
  })

  describe('extractInterests', () => {
    it('extracts interests from item metadata', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                topics: ['react-three-fiber', 'camera-controls'],
                tools: ['three.js'],
                people: [],
                repos: ['pmndrs/drei']
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      })
      global.fetch = mockFetch

      const { extractInterests } = await import('./interests')
      const result = await extractInterests({
        title: 'React Three Fiber Camera Controls',
        summary: 'A library for camera controls in R3F',
        tags: ['r3f', 'three.js', 'camera'],
        domain: 'vibe-coding'
      })

      expect(result).not.toBeNull()
      expect(result?.interests).toBeDefined()
      expect(result?.interests.length).toBeGreaterThan(0)
    })
  })

  describe('calculateWeight', () => {
    it('returns higher weight for recent occurrences', async () => {
      const { calculateWeight } = await import('./interests')

      const recent = calculateWeight(5, new Date())
      const old = calculateWeight(5, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

      expect(recent).toBeGreaterThan(old)
    })

    it('returns higher weight for more occurrences', async () => {
      const { calculateWeight } = await import('./interests')
      const now = new Date()

      const manyOccurrences = calculateWeight(10, now)
      const fewOccurrences = calculateWeight(2, now)

      expect(manyOccurrences).toBeGreaterThan(fewOccurrences)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/interests.test.ts`

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/lib/interests.ts
// Interest extraction and management for the interest graph

// OpenAI pricing
const OPENAI_INPUT_PRICE = 0.15 / 1_000_000
const OPENAI_OUTPUT_PRICE = 0.60 / 1_000_000

export interface Interest {
  type: 'topic' | 'tool' | 'domain' | 'person' | 'repo'
  value: string
}

export interface ExtractedInterests {
  interests: Interest[]
  cost: number
}

export interface ItemInput {
  title: string | null
  summary: string | null
  tags: string[] | null
  domain: string | null
  github_url?: string | null
}

/**
 * Extract interests from an item using AI
 */
export async function extractInterests(item: ItemInput): Promise<ExtractedInterests | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  const context = `
Title: ${item.title || 'Unknown'}
Summary: ${item.summary || 'None'}
Tags: ${item.tags?.join(', ') || 'None'}
Domain: ${item.domain || 'Unknown'}
GitHub: ${item.github_url || 'None'}
`.trim()

  const prompt = `Extract interests from this captured item. Return JSON with:
- topics: Technical topics (e.g., "react-three-fiber", "camera-controls", "embeddings")
- tools: Specific tools or products (e.g., "cursor", "vercel", "supabase")
- people: People or accounts mentioned (e.g., "@levelsio", "Guillermo Rauch")
- repos: GitHub repo identifiers (e.g., "pmndrs/drei", "vercel/next.js")

${context}

Return ONLY valid JSON, no markdown. Keep values lowercase and hyphenated where appropriate.
Example: {"topics": ["semantic-search"], "tools": ["pgvector"], "people": [], "repos": []}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`OpenAI API error: ${response.status}`, error)
      return null
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content

    if (!text) {
      return null
    }

    // Calculate cost
    const usage = data.usage || {}
    const cost = (usage.prompt_tokens || 0) * OPENAI_INPUT_PRICE +
                 (usage.completion_tokens || 0) * OPENAI_OUTPUT_PRICE

    // Parse response
    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    // Convert to Interest array
    const interests: Interest[] = []

    for (const topic of parsed.topics || []) {
      interests.push({ type: 'topic', value: topic.toLowerCase() })
    }
    for (const tool of parsed.tools || []) {
      interests.push({ type: 'tool', value: tool.toLowerCase() })
    }
    for (const person of parsed.people || []) {
      interests.push({ type: 'person', value: person })
    }
    for (const repo of parsed.repos || []) {
      interests.push({ type: 'repo', value: repo.toLowerCase() })
    }

    // Also add the domain as an interest
    if (item.domain && item.domain !== 'other') {
      interests.push({ type: 'domain', value: item.domain })
    }

    return { interests, cost }
  } catch (error) {
    console.error('Interest extraction error:', error)
    return null
  }
}

/**
 * Calculate weight for an interest based on recency and frequency
 *
 * Formula: base_weight * recency_factor * frequency_factor
 * - recency_factor: decays over 30 days (1.0 → 0.5)
 * - frequency_factor: increases with occurrences (log scale)
 */
export function calculateWeight(occurrenceCount: number, lastSeen: Date): number {
  const now = Date.now()
  const daysSinceLastSeen = (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24)

  // Recency factor: exponential decay over 30 days
  // At 0 days: 1.0, at 30 days: 0.5, at 60 days: 0.25
  const recencyFactor = Math.pow(0.5, daysSinceLastSeen / 30)

  // Frequency factor: logarithmic scaling
  // 1 occurrence: 1.0, 5 occurrences: ~1.6, 10 occurrences: ~2.3
  const frequencyFactor = 1 + Math.log10(occurrenceCount)

  // Combine factors, cap at 1.0
  const weight = Math.min(1.0, 0.5 * recencyFactor * frequencyFactor)

  return Math.round(weight * 100) / 100 // Round to 2 decimal places
}

/**
 * Decay all weights for a user (run periodically)
 */
export function getDecayQuery(userId: string, decayFactor: number = 0.95): string {
  return `
    UPDATE user_interests
    SET weight = GREATEST(0.1, weight * ${decayFactor})
    WHERE user_id = '${userId}'
    AND last_seen < NOW() - INTERVAL '7 days'
  `
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/interests.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/interests.ts src/lib/interests.test.ts
git commit -m "feat: add interest extraction service"
```

---

### Task 2.3: Integrate Interest Extraction into Item Processing

**Files:**
- Modify: `src/inngest/functions/process-item.ts`

**Step 1: Add interest extraction step**

Add after the "generate-embedding" step:

```typescript
// Step 8: Extract and store interests
await step.run("extract-interests", async () => {
  const { extractInterests, calculateWeight } = await import("@/lib/interests");

  // Fetch the processed item
  const { data: processed } = await supabase
    .from("items")
    .select("title, summary, tags, domain, github_url, user_id")
    .eq("id", itemId)
    .single();

  if (!processed || !processed.title) {
    console.log("Skipping interest extraction - no title");
    return;
  }

  const result = await extractInterests({
    title: processed.title,
    summary: processed.summary,
    tags: processed.tags,
    domain: processed.domain,
    github_url: processed.github_url,
  });

  if (!result || result.interests.length === 0) {
    console.log("No interests extracted");
    return;
  }

  // Upsert each interest
  for (const interest of result.interests) {
    const { data: existing } = await supabase
      .from("user_interests")
      .select("id, occurrence_count, first_seen")
      .eq("user_id", processed.user_id)
      .eq("interest_type", interest.type)
      .eq("value", interest.value)
      .single();

    if (existing) {
      // Update existing interest
      const newCount = existing.occurrence_count + 1;
      const weight = calculateWeight(newCount, new Date());

      await supabase
        .from("user_interests")
        .update({
          occurrence_count: newCount,
          weight,
          last_seen: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      // Insert new interest
      await supabase
        .from("user_interests")
        .insert({
          user_id: processed.user_id,
          interest_type: interest.type,
          value: interest.value,
          weight: 0.5,
          occurrence_count: 1,
        });
    }
  }

  console.log(`Extracted ${result.interests.length} interests, cost: $${result.cost.toFixed(6)}`);
});
```

**Step 2: Test manually**

Send a test link via Telegram and verify interests are extracted to `user_interests` table.

**Step 3: Commit**

```bash
git add src/inngest/functions/process-item.ts
git commit -m "feat: extract interests from items during processing"
```

---

### Task 2.4: Backfill Interests from Existing Items

**Files:**
- Create: `scripts/backfill-interests.ts`

**Step 1: Create backfill script**

```typescript
// scripts/backfill-interests.ts
// Run with: npx tsx scripts/backfill-interests.ts

import { createClient } from '@supabase/supabase-js'
import { extractInterests, calculateWeight } from '../src/lib/interests'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfillInterests() {
  console.log('Fetching processed items...')

  const { data: items, error } = await supabase
    .from('items')
    .select('id, title, summary, tags, domain, github_url, user_id, captured_at')
    .eq('status', 'processed')
    .order('captured_at', { ascending: true }) // Process oldest first for correct weighting

  if (error) {
    console.error('Failed to fetch items:', error)
    process.exit(1)
  }

  console.log(`Processing ${items?.length || 0} items`)

  let totalCost = 0
  let totalInterests = 0

  for (const item of items || []) {
    if (!item.title) continue

    const result = await extractInterests({
      title: item.title,
      summary: item.summary,
      tags: item.tags,
      domain: item.domain,
      github_url: item.github_url,
    })

    if (!result) continue

    totalCost += result.cost

    for (const interest of result.interests) {
      const { data: existing } = await supabase
        .from('user_interests')
        .select('id, occurrence_count')
        .eq('user_id', item.user_id)
        .eq('interest_type', interest.type)
        .eq('value', interest.value)
        .single()

      if (existing) {
        const newCount = existing.occurrence_count + 1
        const weight = calculateWeight(newCount, new Date(item.captured_at))

        await supabase
          .from('user_interests')
          .update({
            occurrence_count: newCount,
            weight,
            last_seen: item.captured_at,
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('user_interests')
          .insert({
            user_id: item.user_id,
            interest_type: interest.type,
            value: interest.value,
            weight: calculateWeight(1, new Date(item.captured_at)),
            occurrence_count: 1,
            first_seen: item.captured_at,
            last_seen: item.captured_at,
          })
        totalInterests++
      }
    }

    console.log(`✓ ${item.title.slice(0, 40)}... (${result.interests.length} interests)`)

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log(`\nDone! Created ${totalInterests} interests, cost: $${totalCost.toFixed(4)}`)
}

backfillInterests()
```

**Step 2: Run backfill**

```bash
cd /Users/matthewwalker/Development/mcfw/mollymemo
npx tsx scripts/backfill-interests.ts
```

**Step 3: Verify**

```sql
SELECT interest_type, COUNT(*) as count
FROM user_interests
GROUP BY interest_type
ORDER BY count DESC;
```

**Step 4: Commit**

```bash
git add scripts/backfill-interests.ts
git commit -m "feat: add backfill script for interest extraction"
```

---

## Phase 3: Proactive Discovery

Molly searches for things you'd like.

### Task 3.1: HN Algolia Search Service

**Files:**
- Create: `src/lib/discovery/hackernews.ts`
- Create: `src/lib/discovery/hackernews.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/discovery/hackernews.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('hackernews', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('searchHN', () => {
    it('searches HN Algolia API', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: [
            {
              objectID: '123',
              title: 'Show HN: React Three Fiber tricks',
              url: 'https://example.com/r3f',
              points: 150,
              num_comments: 45,
              created_at: '2026-01-30T10:00:00Z'
            }
          ]
        })
      })
      global.fetch = mockFetch

      const { searchHN } = await import('./hackernews')
      const results = await searchHN('react three fiber', { days: 7 })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].title).toContain('React Three Fiber')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/discovery/hackernews.test.ts`

**Step 3: Write implementation**

```typescript
// src/lib/discovery/hackernews.ts
// Hacker News search via Algolia API (free, no auth required)

export interface HNResult {
  id: string
  title: string
  url: string | null
  hnUrl: string
  points: number
  comments: number
  createdAt: Date
}

export interface HNSearchOptions {
  days?: number      // Look back N days (default: 7)
  minPoints?: number // Minimum points threshold (default: 10)
  limit?: number     // Max results (default: 20)
}

/**
 * Search Hacker News via Algolia API
 */
export async function searchHN(
  query: string,
  options: HNSearchOptions = {}
): Promise<HNResult[]> {
  const { days = 7, minPoints = 10, limit = 20 } = options

  // Calculate timestamp for date filter
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const timestamp = Math.floor(cutoffDate.getTime() / 1000)

  // Build Algolia search URL
  const params = new URLSearchParams({
    query,
    tags: 'story', // Only stories, not comments
    numericFilters: `created_at_i>${timestamp},points>${minPoints}`,
    hitsPerPage: String(limit),
  })

  const url = `https://hn.algolia.com/api/v1/search?${params}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`HN Algolia error: ${response.status}`)
      return []
    }

    const data = await response.json()

    return (data.hits || []).map((hit: {
      objectID: string
      title: string
      url: string | null
      points: number
      num_comments: number
      created_at: string
    }) => ({
      id: hit.objectID,
      title: hit.title,
      url: hit.url,
      hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points,
      comments: hit.num_comments,
      createdAt: new Date(hit.created_at),
    }))
  } catch (error) {
    console.error('HN search error:', error)
    return []
  }
}

/**
 * Search HN for multiple queries (batch)
 */
export async function searchHNBatch(
  queries: string[],
  options: HNSearchOptions = {}
): Promise<Map<string, HNResult[]>> {
  const results = new Map<string, HNResult[]>()

  // Run searches sequentially to avoid rate limiting
  for (const query of queries) {
    const hits = await searchHN(query, options)
    results.set(query, hits)

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return results
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add src/lib/discovery/
git commit -m "feat: add HN Algolia search for proactive discovery"
```

---

### Task 3.2: Discovery Cron Job

**Files:**
- Create: `src/inngest/functions/discover.ts`
- Modify: `src/inngest/functions/index.ts`

**Step 1: Create discovery function**

```typescript
// src/inngest/functions/discover.ts
// Proactive discovery cron - searches external sources based on user interests

import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase'
import { searchHN } from '@/lib/discovery/hackernews'
import { generateEmbedding } from '@/lib/embeddings'

export const discoverContent = inngest.createFunction(
  {
    id: 'discover-content',
    retries: 2,
  },
  { cron: '0 */6 * * *' }, // Every 6 hours
  async ({ step }) => {
    const supabase = createServiceClient()

    // Step 1: Get all users with interests
    const users = await step.run('get-users', async () => {
      const { data } = await supabase
        .from('users')
        .select('id, display_name')
      return data || []
    })

    for (const user of users) {
      // Step 2: Get top interests for this user
      const interests = await step.run(`get-interests-${user.id}`, async () => {
        const { data } = await supabase
          .from('user_interests')
          .select('interest_type, value, weight')
          .eq('user_id', user.id)
          .order('weight', { ascending: false })
          .limit(10)
        return data || []
      })

      if (interests.length === 0) continue

      // Step 3: Build search queries from interests
      const queries = interests
        .filter(i => i.interest_type === 'topic' || i.interest_type === 'tool')
        .slice(0, 5)
        .map(i => i.value)

      if (queries.length === 0) continue

      // Step 4: Search HN
      const discoveries = await step.run(`search-hn-${user.id}`, async () => {
        const allResults: Array<{
          query: string
          result: Awaited<ReturnType<typeof searchHN>>[0]
        }> = []

        for (const query of queries) {
          const results = await searchHN(query, { days: 7, minPoints: 20, limit: 5 })
          for (const result of results) {
            allResults.push({ query, result })
          }
        }

        return allResults
      })

      // Step 5: Filter and store relevant discoveries
      await step.run(`store-discoveries-${user.id}`, async () => {
        // Get user's existing items to avoid duplicates
        const { data: existingItems } = await supabase
          .from('items')
          .select('source_url')
          .eq('user_id', user.id)

        const existingUrls = new Set(existingItems?.map(i => i.source_url) || [])

        // Get existing memos to avoid duplicates
        const { data: existingMemos } = await supabase
          .from('memos')
          .select('source_url')
          .eq('user_id', user.id)

        const existingMemoUrls = new Set(existingMemos?.map(m => m.source_url) || [])

        let stored = 0
        for (const { query, result } of discoveries) {
          const url = result.url || result.hnUrl

          // Skip if already captured or already a memo
          if (existingUrls.has(url) || existingMemoUrls.has(url)) continue

          // Calculate relevance based on which interest matched
          const matchedInterest = interests.find(i => i.value === query)
          const relevanceScore = matchedInterest?.weight || 0.5

          // Store as memo
          await supabase.from('memos').insert({
            user_id: user.id,
            source_url: url,
            source_platform: 'hackernews',
            external_id: result.id,
            title: result.title,
            summary: `${result.points} points, ${result.comments} comments on HN`,
            relevance_score: relevanceScore,
            relevance_reason: `Matches your interest in "${query}"`,
            matched_interests: [{ type: 'topic', value: query, weight: matchedInterest?.weight }],
            status: relevanceScore > 0.7 ? 'pending' : 'pending', // High relevance could trigger ping
          }).onConflict('user_id, source_url').ignore()

          stored++
        }

        console.log(`Stored ${stored} new memos for user ${user.id}`)
        return stored
      })
    }

    return { processed: users.length }
  }
)
```

**Step 2: Export from index**

```typescript
// src/inngest/functions/index.ts
export { processItem } from './process-item'
export { discoverContent } from './discover'
```

**Step 3: Commit**

```bash
git add src/inngest/functions/
git commit -m "feat: add discovery cron for proactive content search"
```

---

### Task 3.3: Digest Integration

**Files:**
- Modify: `src/lib/digest/generator.ts`

**Step 1: Update generateScript to include memos**

Add memos to the digest input and prompt:

```typescript
// Add to DigestInput interface
export interface DigestInput {
  // ... existing fields ...
  memos: Array<{
    title: string
    summary: string
    relevance_reason: string
    source_platform: string
  }>
}

// Update the systemPrompt to include memos section
// After "## Today's Items" section, add:

## Molly's Discoveries (${input.memos.length} items)
${input.memos.length > 0 ? `
I also found some things you might like based on your interests:
${JSON.stringify(input.memos, null, 2)}

Weave these into the digest naturally after covering the user's captures.
Say something like "I also found a few things you might like..." and briefly mention 2-3 of them.
` : 'No discoveries this time.'}
```

**Step 2: Update cron/digest to fetch memos**

Modify `src/app/api/cron/digest/route.ts` to include pending memos.

**Step 3: Commit**

```bash
git add src/lib/digest/ src/app/api/cron/digest/
git commit -m "feat: integrate memos into daily digest"
```

---

## Phase 4: Real-Time Pings (Optional)

High-relevance discoveries trigger immediate notification.

### Task 4.1: Ping Service

**Files:**
- Create: `src/lib/notifications/ping.ts`

```typescript
// src/lib/notifications/ping.ts
// Send real-time pings for high-relevance discoveries

import { sendMessage } from '@/lib/telegram'
import { createServiceClient } from '@/lib/supabase'

export interface PingOptions {
  userId: string
  memoId: string
  title: string
  relevanceReason: string
  sourceUrl: string
}

export async function sendPing(options: PingOptions): Promise<boolean> {
  const { userId, memoId, title, relevanceReason, sourceUrl } = options

  const supabase = createServiceClient()

  // Get user's Telegram chat ID
  const { data: user } = await supabase
    .from('users')
    .select('telegram_user_id')
    .eq('id', userId)
    .single()

  if (!user?.telegram_user_id) {
    console.log('No Telegram ID for user, skipping ping')
    return false
  }

  const message = `🎯 Found something you might like:

**${title}**

${relevanceReason}

[Check it out](${sourceUrl}) or wait for tomorrow's briefing.`

  try {
    await sendMessage(user.telegram_user_id, message)

    // Mark memo as pinged
    await supabase
      .from('memos')
      .update({ status: 'pinged', shown_at: new Date().toISOString() })
      .eq('id', memoId)

    return true
  } catch (error) {
    console.error('Ping failed:', error)
    return false
  }
}
```

**Commit:**

```bash
git add src/lib/notifications/
git commit -m "feat: add real-time ping notifications for high-relevance discoveries"
```

---

## Testing & Validation

### Manual Test Checklist

1. **Semantic Search**
   - [ ] Capture a link about "React Three Fiber"
   - [ ] Search for "R3F camera" and verify it finds the item
   - [ ] Search for "3D visualization" and verify semantic match

2. **Interest Graph**
   - [ ] Capture 3 items about the same topic
   - [ ] Verify `user_interests` table shows increasing weight
   - [ ] Verify interest type is correctly classified

3. **Discovery**
   - [ ] Trigger discovery cron manually
   - [ ] Verify memos are created in `memos` table
   - [ ] Verify no duplicates with existing items

4. **Digest Integration**
   - [ ] Trigger digest generation
   - [ ] Verify Molly mentions discoveries
   - [ ] Verify memos are marked as shown

---

## Cost Estimates

| Operation | Cost per item | Monthly (100 items) |
|-----------|--------------|---------------------|
| Embedding generation | ~$0.0001 | ~$0.01 |
| Interest extraction | ~$0.0005 | ~$0.05 |
| Discovery (HN search) | Free | Free |
| Relevance filtering | ~$0.0002/check | ~$0.10 |
| **Total** | | **~$0.16/month** |

---

## Future Enhancements (Not in Scope)

- Reddit API integration
- X/Twitter search via Grok
- GitHub Trending integration
- Interest graph visualization (mindmap)
- Feedback loop (dismissed memos reduce interest weight)
