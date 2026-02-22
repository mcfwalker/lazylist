# Digest v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the daily digest from recap-style to insight-first, with configurable cadence (daily/weekly/never).

**Architecture:** Replace `digest_enabled` boolean with `digest_frequency` enum + `digest_day` int. Add three new data fetchers (container activity, cross-references, project matches) that run in parallel with existing fetchers. Restructure the Claude prompt to lead with insights and use items as supporting evidence. Update cron to handle weekly scheduling.

**Tech Stack:** Next.js, Supabase (Postgres), Anthropic Claude Sonnet 4, TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-21-digest-v2-design.md`

---

### Task 1: Apply database migration

**Files:**
- Create: `supabase/migrations/20260221_digest_v2.sql`

**Step 1: Write the migration file**

```sql
-- MOL-7: Digest v2 — configurable cadence
-- Add digest_frequency (daily/weekly/never) to replace digest_enabled boolean
-- Add digest_day (0-6, 0=Sunday) for weekly digest scheduling

ALTER TABLE users ADD COLUMN digest_frequency TEXT DEFAULT 'daily';
ALTER TABLE users ADD COLUMN digest_day INTEGER DEFAULT 1;

-- Migrate existing data
UPDATE users SET digest_frequency = 'daily' WHERE digest_enabled = true;
UPDATE users SET digest_frequency = 'never' WHERE digest_enabled = false;

-- Drop old column
ALTER TABLE users DROP COLUMN digest_enabled;
```

**Step 2: Apply migration via Supabase MCP**

Run: `mcp__supabase-mcfw__apply_migration` with project_id `uygkxicupbvnfdcymyge`, name `20260221_digest_v2`

**Step 3: Commit**

```bash
git add supabase/migrations/20260221_digest_v2.sql
git commit -m "feat: add digest_frequency and digest_day columns (MOL-7)"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/supabase.ts:48-54` — no change needed to User interface (it doesn't have digest fields)
- Modify: `src/lib/digest/index.ts:10-18` — update `DigestUser` interface
- Modify: `src/lib/digest/generator.ts:46-62` — update `DigestInput` interface
- Modify: `src/app/settings/page.tsx:8-12` — update `UserSettings` interface

**Step 1: Update DigestUser in `src/lib/digest/index.ts`**

Replace `digest_enabled: boolean` with `digest_frequency: string` in the `DigestUser` interface (line 14). The interface should be:

```typescript
export interface DigestUser {
  id: string
  display_name: string | null
  telegram_user_id: number
  digest_frequency: string  // 'daily' | 'weekly' | 'never'
  digest_day: number        // 0=Sun, 1=Mon, ..., 6=Sat
  digest_time: string
  timezone: string
  molly_context: string | null
}
```

**Step 2: Add new types for data fetchers in `src/lib/digest/generator.ts`**

Add after `TrendItem` (after line 44):

```typescript
export interface ContainerActivity {
  containerId: string
  containerName: string
  itemCountInWindow: number
  totalItemCount: number
  isNew: boolean // created within the digest window
}

export interface CrossReference {
  itemId: string
  itemTitle: string
  sourceUrl: string
  containerNames: string[]
}

export interface ProjectMatch {
  projectName: string
  projectDescription: string | null
  matchedItems: { itemId: string; itemTitle: string; matchedTags: string[] }[]
}
```

**Step 3: Update `DigestInput` in `src/lib/digest/generator.ts`**

Add new fields to the `DigestInput` interface (lines 46-62):

```typescript
export interface DigestInput {
  user: {
    id: string
    displayName: string | null
    timezone: string
    mollyContext: string | null
  }
  frequency: 'daily' | 'weekly'
  items: DigestItem[]
  memos: MemoItem[]
  trends: TrendItem[]
  containerActivity: ContainerActivity[]
  crossReferences: CrossReference[]
  projectMatches: ProjectMatch[]
  previousDigest: {
    id: string
    scriptText: string
    generatedAt: Date
    itemCount: number
  } | null
}
```

**Step 4: Update `UserSettings` in `src/app/settings/page.tsx`**

Replace the interface (lines 8-12):

```typescript
interface UserSettings {
  digest_frequency: string  // 'daily' | 'weekly' | 'never'
  digest_day: number        // 0=Sun, 1=Mon, ..., 6=Sat
  digest_time: string
  timezone: string
}
```

**Step 5: Commit**

```bash
git add src/lib/digest/index.ts src/lib/digest/generator.ts src/app/settings/page.tsx
git commit -m "feat: update TypeScript types for digest v2 (MOL-7)"
```

---

### Task 3: Write data fetcher tests

**Files:**
- Create: `src/lib/digest/data-fetchers.test.ts`

Write tests FIRST for the three new data fetchers. All tests mock Supabase.

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}))

import { createServiceClient } from '@/lib/supabase'
import {
  getContainerActivity,
  getCrossReferences,
  getProjectMatches,
} from './data-fetchers'

describe('Digest Data Fetchers', () => {
  let mockSupabase: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      rpc: vi.fn(),
    }
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never)
  })

  describe('getContainerActivity', () => {
    it('should return containers with item counts in window', async () => {
      // Mock container_items query to find items in window
      const since = new Date('2026-02-20T00:00:00Z')
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'container_items') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { container_id: 'c1', item_id: 'i1', containers: { id: 'c1', name: 'AI Tools', item_count: 10, created_at: '2026-01-01T00:00:00Z' } },
                    { container_id: 'c1', item_id: 'i2', containers: { id: 'c1', name: 'AI Tools', item_count: 10, created_at: '2026-01-01T00:00:00Z' } },
                    { container_id: 'c2', item_id: 'i3', containers: { id: 'c2', name: 'New Bucket', item_count: 1, created_at: '2026-02-20T12:00:00Z' } },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        return mockSupabase
      })

      const result = await getContainerActivity('user-1', since)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        containerId: 'c1',
        containerName: 'AI Tools',
        itemCountInWindow: 2,
        totalItemCount: 10,
        isNew: false,
      })
      expect(result[1]).toEqual({
        containerId: 'c2',
        containerName: 'New Bucket',
        itemCountInWindow: 1,
        totalItemCount: 1,
        isNew: true,
      })
    })

    it('should return empty array on error', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        }),
      }))

      const result = await getContainerActivity('user-1', new Date())
      expect(result).toEqual([])
    })
  })

  describe('getCrossReferences', () => {
    it('should return items appearing in 2+ containers', async () => {
      const since = new Date('2026-02-20T00:00:00Z')
      // Items in the window
      const windowItems = [
        { id: 'i1', title: 'LLM Agents Guide', source_url: 'https://example.com/agents' },
        { id: 'i2', title: 'React Tutorial', source_url: 'https://example.com/react' },
      ]
      // Container assignments for those items
      const containerItems = [
        { item_id: 'i1', containers: { name: 'AI Tools' } },
        { item_id: 'i1', containers: { name: 'Side Projects' } },
        { item_id: 'i2', containers: { name: 'Frontend' } },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: windowItems, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'container_items') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: containerItems, error: null }),
            }),
          }
        }
        return mockSupabase
      })

      const result = await getCrossReferences('user-1', since)

      // Only i1 appears in 2+ containers
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        itemId: 'i1',
        itemTitle: 'LLM Agents Guide',
        sourceUrl: 'https://example.com/agents',
        containerNames: ['AI Tools', 'Side Projects'],
      })
    })

    it('should return empty array when no cross-references exist', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }))

      const result = await getCrossReferences('user-1', new Date())
      expect(result).toEqual([])
    })
  })

  describe('getProjectMatches', () => {
    it('should match items to projects by tag intersection', async () => {
      const since = new Date('2026-02-20T00:00:00Z')
      const anchors = [
        { name: 'Agent Framework', description: 'Building AI agents', tags: ['ai', 'agents', 'llm'] },
        { name: 'Blog Redesign', description: 'New blog layout', tags: ['frontend', 'css'] },
      ]
      const items = [
        { id: 'i1', title: 'LLM Orchestration', tags: ['ai', 'agents'] },
        { id: 'i2', title: 'CSS Grid Guide', tags: ['css', 'frontend'] },
        { id: 'i3', title: 'Cooking Recipe', tags: ['food'] },
      ]

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'project_anchors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: anchors, error: null }),
              }),
            }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: items, error: null }),
                }),
              }),
            }),
          }
        }
        return mockSupabase
      })

      const result = await getProjectMatches('user-1', since)

      expect(result).toHaveLength(2)
      expect(result[0].projectName).toBe('Agent Framework')
      expect(result[0].matchedItems).toHaveLength(1)
      expect(result[0].matchedItems[0].itemId).toBe('i1')
      expect(result[0].matchedItems[0].matchedTags).toEqual(['ai', 'agents'])

      expect(result[1].projectName).toBe('Blog Redesign')
      expect(result[1].matchedItems).toHaveLength(1)
      expect(result[1].matchedItems[0].itemId).toBe('i2')
    })

    it('should exclude projects with no matching items', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'project_anchors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ name: 'Unrelated Project', description: null, tags: ['quantum'] }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: 'i1', title: 'React App', tags: ['react'] }],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        return mockSupabase
      })

      const result = await getProjectMatches('user-1', new Date())
      expect(result).toEqual([])
    })

    it('should return empty array when no project anchors exist', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'project_anchors') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        return mockSupabase
      })

      const result = await getProjectMatches('user-1', new Date())
      expect(result).toEqual([])
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/digest/data-fetchers.test.ts`
Expected: FAIL — module `./data-fetchers` not found

**Step 3: Commit**

```bash
git add src/lib/digest/data-fetchers.test.ts
git commit -m "test: add failing tests for digest data fetchers (MOL-7)"
```

---

### Task 4: Implement data fetchers

**Files:**
- Create: `src/lib/digest/data-fetchers.ts`

**Step 1: Implement the three data fetcher functions**

```typescript
// Data fetchers for digest v2 insight sources
// Container activity, cross-references, and project matches

import { createServiceClient } from '@/lib/supabase'
import type { ContainerActivity, CrossReference, ProjectMatch } from './generator'

// Get container activity within the digest window
export async function getContainerActivity(
  userId: string,
  since: Date
): Promise<ContainerActivity[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('container_items')
    .select('container_id, item_id, containers!inner(id, name, item_count, created_at)')
    .gte('added_at', since.toISOString())
    .eq('containers.user_id', userId)

  if (error || !data) {
    console.error('Error fetching container activity:', error)
    return []
  }

  // Group by container
  const containerMap = new Map<string, {
    name: string
    totalItemCount: number
    createdAt: string
    windowItemIds: Set<string>
  }>()

  for (const row of data) {
    const container = row.containers as unknown as {
      id: string; name: string; item_count: number; created_at: string
    }
    if (!containerMap.has(container.id)) {
      containerMap.set(container.id, {
        name: container.name,
        totalItemCount: container.item_count,
        createdAt: container.created_at,
        windowItemIds: new Set(),
      })
    }
    containerMap.get(container.id)!.windowItemIds.add(row.item_id)
  }

  return Array.from(containerMap.entries()).map(([id, info]) => ({
    containerId: id,
    containerName: info.name,
    itemCountInWindow: info.windowItemIds.size,
    totalItemCount: info.totalItemCount,
    isNew: new Date(info.createdAt) >= since,
  }))
}

// Get items that appear in 2+ containers within the digest window
export async function getCrossReferences(
  userId: string,
  since: Date
): Promise<CrossReference[]> {
  const supabase = createServiceClient()

  // Get items in the window
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, title, source_url')
    .eq('user_id', userId)
    .gte('processed_at', since.toISOString())
    .eq('status', 'processed')

  if (itemsError || !items || items.length === 0) {
    return []
  }

  // Get container assignments for those items
  const itemIds = items.map(i => i.id)
  const { data: containerItems, error: ciError } = await supabase
    .from('container_items')
    .select('item_id, containers!inner(name)')
    .in('item_id', itemIds)

  if (ciError || !containerItems) {
    return []
  }

  // Group container names by item
  const itemContainers = new Map<string, string[]>()
  for (const ci of containerItems) {
    const containerName = (ci.containers as unknown as { name: string }).name
    if (!itemContainers.has(ci.item_id)) {
      itemContainers.set(ci.item_id, [])
    }
    itemContainers.get(ci.item_id)!.push(containerName)
  }

  // Filter to items in 2+ containers
  return items
    .filter(item => (itemContainers.get(item.id)?.length ?? 0) >= 2)
    .map(item => ({
      itemId: item.id,
      itemTitle: item.title || 'Untitled',
      sourceUrl: item.source_url,
      containerNames: itemContainers.get(item.id)!,
    }))
}

// Match items to project anchors by tag intersection
export async function getProjectMatches(
  userId: string,
  since: Date
): Promise<ProjectMatch[]> {
  const supabase = createServiceClient()

  // Get active project anchors
  const { data: anchors, error: anchorError } = await supabase
    .from('project_anchors')
    .select('name, description, tags')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (anchorError || !anchors || anchors.length === 0) {
    return []
  }

  // Get items in the window with their tags
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, title, tags')
    .eq('user_id', userId)
    .gte('processed_at', since.toISOString())
    .eq('status', 'processed')

  if (itemsError || !items || items.length === 0) {
    return []
  }

  // Match items to projects by tag intersection
  const results: ProjectMatch[] = []

  for (const anchor of anchors) {
    const projectTags = new Set((anchor.tags || []).map((t: string) => t.toLowerCase()))
    if (projectTags.size === 0) continue

    const matched: ProjectMatch['matchedItems'] = []

    for (const item of items) {
      const itemTags = (item.tags || []).map((t: string) => t.toLowerCase())
      const overlap = itemTags.filter(t => projectTags.has(t))
      if (overlap.length > 0) {
        matched.push({
          itemId: item.id,
          itemTitle: item.title || 'Untitled',
          matchedTags: overlap,
        })
      }
    }

    if (matched.length > 0) {
      results.push({
        projectName: anchor.name,
        projectDescription: anchor.description,
        matchedItems: matched,
      })
    }
  }

  return results
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/digest/data-fetchers.test.ts`
Expected: All tests PASS

Note: The test mocks may need adjustment to match the exact Supabase query chain. The implementing agent should align the mocks to the actual query structure.

**Step 3: Commit**

```bash
git add src/lib/digest/data-fetchers.ts
git commit -m "feat: add container activity, cross-ref, and project match fetchers (MOL-7)"
```

---

### Task 5: Update digest orchestrator

**Files:**
- Modify: `src/lib/digest/index.ts`

**Step 1: Update `getItemsForDigest` to accept a `since` date parameter**

Change `getItemsForDigest(userId: string)` (line 159) to `getItemsForDigest(userId: string, since: Date)`. Replace the hardcoded `oneDayAgo` (line 162) with the `since` parameter.

```typescript
async function getItemsForDigest(userId: string, since: Date): Promise<DigestItem[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('items')
    .select('id, title, summary, domain, content_type, tags, source_url')
    .eq('user_id', userId)
    .eq('status', 'processed')
    .gte('processed_at', since.toISOString())
    .order('processed_at', { ascending: false })
  // ... rest unchanged
```

**Step 2: Update `generateAndSendDigest` signature and data fetching**

Add `frequency` parameter. Compute `since` based on frequency. Import and call new data fetchers.

```typescript
import { getContainerActivity, getCrossReferences, getProjectMatches } from './data-fetchers'

export async function generateAndSendDigest(
  user: DigestUser,
  frequency: 'daily' | 'weekly' = 'daily'
): Promise<void> {
  const supabase = createServiceClient()

  console.log(`Generating ${frequency} digest for user ${user.id} (${user.display_name})`)

  // Compute digest window
  const windowMs = frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const since = new Date(Date.now() - windowMs)

  // Fetch all data sources in parallel
  const [items, memos, trends, containerActivity, crossReferences, projectMatches] =
    await Promise.all([
      getItemsForDigest(user.id, since),
      getPendingMemos(user.id),
      getPendingTrends(user.id),
      getContainerActivity(user.id, since),
      getCrossReferences(user.id, since),
      getProjectMatches(user.id, since),
    ])
```

**Step 3: Pass new data to `generateScript`**

Update the `generateScript` call (lines 62-73) to include frequency and new data:

```typescript
  const { script, cost: scriptCost } = await generateScript({
    user: {
      id: user.id,
      displayName: user.display_name,
      timezone: user.timezone,
      mollyContext: user.molly_context,
    },
    frequency,
    items,
    memos,
    trends,
    containerActivity,
    crossReferences,
    projectMatches,
    previousDigest,
  })
```

**Step 4: Update `getUsersForDigestNow` to use `digest_frequency` instead of `digest_enabled`**

Replace the query at line 224 to select `digest_frequency` and `digest_day` instead of `digest_enabled`. Update the filter to handle daily vs weekly:

```typescript
export async function getUsersForDigestNow(): Promise<{ user: DigestUser; frequency: 'daily' | 'weekly' }[]> {
  const supabase = createServiceClient()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, display_name, telegram_user_id, digest_frequency, digest_day, digest_time, timezone, molly_context')
    .in('digest_frequency', ['daily', 'weekly'])
    .not('telegram_user_id', 'is', null)

  if (error || !users) {
    console.error('Error fetching users for digest:', error)
    return []
  }

  const now = new Date()

  return users.filter((user) => {
    try {
      const userTimeStr = now.toLocaleString('en-US', {
        timeZone: user.timezone || 'America/Los_Angeles',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      })

      const [hourStr, minuteStr] = userTimeStr.split(':')
      const userHour = parseInt(hourStr, 10)
      const userMinute = parseInt(minuteStr, 10)
      const [prefHour] = (user.digest_time || '07:00').split(':').map(Number)

      // Must match preferred hour and be within first 5 minutes
      if (userHour !== prefHour || userMinute >= 5) return false

      // For weekly, also check day of week
      if (user.digest_frequency === 'weekly') {
        const userDayStr = now.toLocaleString('en-US', {
          timeZone: user.timezone || 'America/Los_Angeles',
          weekday: 'short',
        })
        const dayMap: Record<string, number> = {
          'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
        }
        const userDay = dayMap[userDayStr] ?? -1
        if (userDay !== (user.digest_day ?? 1)) return false
      }

      return true
    } catch (e) {
      console.error(`Error checking time for user ${user.id}:`, e)
      return false
    }
  }).map(user => ({
    user: user as unknown as DigestUser,
    frequency: user.digest_frequency as 'daily' | 'weekly',
  }))
}
```

**Step 5: Run build to check types**

Run: `npx tsc --noEmit`
Expected: No type errors (or fix any that appear)

**Step 6: Commit**

```bash
git add src/lib/digest/index.ts
git commit -m "feat: update digest orchestrator with frequency and new data sources (MOL-7)"
```

---

### Task 6: Restructure the prompt

**Files:**
- Modify: `src/lib/digest/generator.ts:64-193`

**Step 1: Update `generateScript` to accept and format new data**

Rewrite the `generateScript` function's system prompt to use the insight-first structure. The function signature stays the same but the prompt body changes significantly.

Key changes to the prompt:
- Add `frequency` awareness (daily vs weekly instructions)
- Add Insights Layer section (trends + cross-references + project connections + container activity)
- Change Items section to "supporting evidence" framing
- Add forward-looking close instruction
- Add weekly-specific instructions ("summarize the week, spotlight 5-8 items")

The new prompt structure should be:

```
You are Molly, a personal knowledge curator who delivers ${frequency} audio digests.

${MOLLY_SOUL}

## Task
Generate a spoken script (5-7 minutes at 140 wpm = 700-1000 words).
${frequency === 'weekly' ? 'This is a WEEKLY digest covering the past 7 days. Summarize the week\'s shape, spotlight 5-8 standout items. Don\'t try to cover everything.' : 'This is a DAILY digest covering the past 24 hours.'}
Write for the ear, not the eye. No markdown. Spell out abbreviations. Don't read URLs.

## Script Structure — INSIGHT-FIRST
Lead with what's INTERESTING about the user's behavior, not what they saved.

1. Greeting (use "${userName}")
2. Continuity hook (if previous digest exists)
3. INSIGHTS LAYER (lead with this):
   - Patterns and trends you've noticed
   - Items that bridge multiple interest areas (cross-references)
   - Connections to their active projects
   - Which knowledge buckets are growing
4. ITEMS LAYER (supporting evidence):
   - Reference specific items as evidence for the patterns above
   - ${frequency === 'weekly' ? 'Pick 5-8 standout items. Skip the rest.' : 'Cover most items but through the lens of patterns, not as a list.'}
   - Don't just enumerate items — weave them into the narrative
5. Forward-looking close:
   - Brief observation about where things seem headed
   - Informed by project context and trend trajectories

## What You Know About ${userName}
${user.mollyContext || 'New user — no context yet.'}

## Previous Digest Context
${previousContext}

## Insights Data

### Trends (${trends.length} detected)
${trends section — same format as before}

### Cross-References (${crossReferences.length} items in multiple containers)
${JSON.stringify cross-refs}
If an item bridges two interest areas, that's worth mentioning.

### Project Connections
${JSON.stringify project matches}
If items connect to active projects, say so. The user wants to know their saves are building toward something.

### Container Activity
${JSON.stringify container activity}
Mention if a container is growing fast or if a new one appeared.

## Items (${items.length} total, ${frequency} window)
${items JSON — same format as before}

## Molly's Discoveries (${memos.length} items)
${memos section — same format as before}

Output ONLY the script text.
```

**Step 2: Run build to check types**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/digest/generator.ts
git commit -m "feat: restructure digest prompt to insight-first format (MOL-7)"
```

---

### Task 7: Update cron route

**Files:**
- Modify: `src/app/api/cron/digest/route.ts`

**Step 1: Update the cron route to use new `getUsersForDigestNow` return type**

The function now returns `{ user, frequency }[]` instead of `DigestUser[]`. Update the production flow (lines 88-120):

```typescript
    // Production mode: find users whose digest time is now
    const usersToProcess = await getUsersForDigestNow()

    console.log(`Found ${usersToProcess.length} users for digest at this hour`)

    const results: Array<{ userId: string; success: boolean; error?: string }> = []

    for (const { user, frequency } of usersToProcess) {
      try {
        await generateAndSendDigest(user, frequency)
        results.push({ userId: user.id, success: true })
      } catch (error) {
        console.error(`Failed to generate digest for user ${user.id}:`, error)
        results.push({
          userId: user.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
```

Also update the test mode query (lines 58-61) to select `digest_frequency, digest_day` instead of `digest_enabled`.

**Step 2: Run build to check types**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/app/api/cron/digest/route.ts
git commit -m "feat: update cron route for daily/weekly/never scheduling (MOL-7)"
```

---

### Task 8: Update settings API

**Files:**
- Modify: `src/app/api/users/settings/route.ts`

**Step 1: Update GET handler**

Replace `digest_enabled` with `digest_frequency` and `digest_day` in the select query (line 33) and response (lines 41-45):

```typescript
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
```

**Step 2: Update PATCH handler**

Update the allowed fields list (line 64) and add validation for new fields:

```typescript
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
        return NextResponse.json({ error: 'Invalid time format' }, { status: 400 })
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
```

**Step 3: Update tests in `src/app/api/users/settings/route.test.ts`**

Replace all `digest_enabled` references with `digest_frequency` and `digest_day`. Add tests for:
- Valid frequency values (daily/weekly/never)
- Invalid frequency rejected
- Valid digest_day (0-6)
- Invalid digest_day rejected

**Step 4: Run tests**

Run: `npx vitest run src/app/api/users/settings/route.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/app/api/users/settings/route.ts src/app/api/users/settings/route.test.ts
git commit -m "feat: update settings API for digest_frequency and digest_day (MOL-7)"
```

---

### Task 9: Update settings UI

**Files:**
- Modify: `src/app/settings/page.tsx`

**Step 1: Replace the digest toggle with a frequency selector**

Replace the checkbox toggle (lines 114-134) with a three-option selector:

```tsx
        <div className={styles.settingCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Digest frequency</span>
              <span className={styles.settingDescription}>
                How often Molly sends your voice digest
              </span>
            </div>
            <select
              value={settings.digest_frequency}
              onChange={(e) => updateSetting({ digest_frequency: e.target.value })}
              disabled={saving}
              className={styles.select}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
```

**Step 2: Add day-of-week picker (visible only for weekly)**

Add after the frequency selector, before the time picker:

```tsx
        {settings.digest_frequency === 'weekly' && (
          <div className={styles.settingCard}>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>Digest day</span>
                <span className={styles.settingDescription}>
                  Which day to receive your weekly digest
                </span>
              </div>
              <select
                value={settings.digest_day}
                onChange={(e) => updateSetting({ digest_day: Number(e.target.value) })}
                disabled={saving}
                className={styles.select}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          </div>
        )}
```

**Step 3: Update the time picker disabled state**

Change `disabled={saving || !settings.digest_enabled}` to `disabled={saving || settings.digest_frequency === 'never'}` on the time input.

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: update settings UI with frequency selector and day picker (MOL-7)"
```

---

### Task 10: Full verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All new tests pass, no regressions (except pre-existing telegram test failures)

**Step 2: Run production build**

Run: `npm run build`
Expected: Clean build, no type errors

**Step 3: Verify manually with test digest (optional)**

If desired, trigger a test digest to verify the new prompt format:
`curl "http://localhost:3000/api/cron/digest?test=true&user_id=<your-user-id>"`

**Step 4: Commit any fixes, then push**

```bash
git push origin main
```
