# MOL-6: Trend Detection Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Analyze the interest graph for velocity, emergence, and convergence trends, store them, surface in digests, and expose via API.

**Architecture:** Daily Inngest cron runs algorithmic detectors (pure SQL/TS) against `user_interests`, `containers`, and `container_items`. If signals found, one GPT-4o mini call narrates them. Results stored in `trends` table. Consumed by digest generator and exposed via `GET /api/trends`.

**Tech Stack:** Supabase (Postgres), OpenAI GPT-4o mini (narration only), Inngest (cron), Next.js API route

---

## Task 1: Create `trends` Table Migration

**Files:**
- Create: `supabase/migrations/20260221_trends.sql`

**Step 1: Create migration file**

```sql
-- Trend detection table for MOL-6
-- Stores algorithmically detected trends, narrated by LLM

CREATE TABLE IF NOT EXISTS trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trend_type TEXT NOT NULL,        -- 'velocity' | 'emergence' | 'convergence'
  title TEXT NOT NULL,             -- AI-generated, e.g. "Deep into agent orchestration"
  description TEXT NOT NULL,       -- AI-generated, full sentence
  signals JSONB NOT NULL,          -- raw detector output for dedup/inspection
  strength DECIMAL DEFAULT 0.5,   -- 0.0-1.0 signal intensity
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,          -- stale after 30 days
  surfaced BOOLEAN DEFAULT FALSE,  -- included in a digest?
  UNIQUE(user_id, trend_type, title)
);

CREATE INDEX idx_trends_user_active ON trends(user_id, surfaced, expires_at);

-- RLS
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trends" ON trends
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to trends" ON trends
  FOR ALL USING (true);
```

**Step 2: Apply migration via Supabase MCP**

Run: `mcp__supabase-mcfw__apply_migration` with:
- project_id: `uygkxicupbvnfdcymyge`
- name: `trends`
- query: (the SQL above)

**Step 3: Verify migration**

Run: `mcp__supabase-mcfw__list_tables` and confirm `trends` table exists.

**Step 4: Commit**

```bash
git add supabase/migrations/20260221_trends.sql
git commit -m "feat: add trends table for trend detection (MOL-6)"
```

---

## Task 2: Build Trend Detectors — Types and Velocity

**Files:**
- Create: `src/lib/trends.test.ts`
- Create: `src/lib/trends.ts`

**Step 1: Write failing tests for velocity detection**

```typescript
// src/lib/trends.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('detectVelocity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects containers with >= 3 items in 14 days', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any

    // Mock containers query
    mockFrom.mockImplementation((table: string) => {
      if (table === 'containers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'c-1', name: 'Agent Orchestration', item_count: 8 },
                { id: 'c-2', name: 'Game Design', item_count: 2 },
              ],
              error: null,
            }),
          }),
        }
      }
      if (table === 'container_items') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [
                  { container_id: 'c-1', items: { captured_at: '2026-02-20' } },
                  { container_id: 'c-1', items: { captured_at: '2026-02-19' } },
                  { container_id: 'c-1', items: { captured_at: '2026-02-18' } },
                  { container_id: 'c-1', items: { captured_at: '2026-02-17' } },
                  { container_id: 'c-2', items: { captured_at: '2026-02-20' } },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const { detectVelocity } = await import('./trends')
    const signals = await detectVelocity(supabase, 'user-1')

    expect(signals).toHaveLength(1)
    expect(signals[0].containerId).toBe('c-1')
    expect(signals[0].containerName).toBe('Agent Orchestration')
    expect(signals[0].itemCount14d).toBe(4)
  })

  it('returns empty when no containers have enough activity', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any

    mockFrom.mockImplementation((table: string) => {
      if (table === 'containers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'c-1', name: 'Solo', item_count: 1 }],
              error: null,
            }),
          }),
        }
      }
      if (table === 'container_items') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [
                  { container_id: 'c-1', items: { captured_at: '2026-02-20' } },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const { detectVelocity } = await import('./trends')
    const signals = await detectVelocity(supabase, 'user-1')

    expect(signals).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: FAIL with "Cannot find module './trends'"

**Step 3: Write types and velocity detector**

```typescript
// src/lib/trends.ts
// Trend detection engine — algorithmic detectors + LLM narration

// OpenAI pricing for gpt-4o-mini
const OPENAI_INPUT_PRICE = 0.15 / 1_000_000
const OPENAI_OUTPUT_PRICE = 0.60 / 1_000_000

// --- Types ---

export interface VelocitySignal {
  type: 'velocity'
  containerId: string
  containerName: string
  itemCount14d: number
}

export interface EmergenceSignal {
  type: 'emergence'
  interestType: string
  value: string
  occurrenceCount: number
  firstSeen: string
}

export interface ConvergenceSignal {
  type: 'convergence'
  containerA: { id: string; name: string }
  containerB: { id: string; name: string }
  sharedItems: number
}

export type TrendSignal = VelocitySignal | EmergenceSignal | ConvergenceSignal

export interface NarratedTrend {
  trendType: string
  title: string
  description: string
  strength: number
  signals: object
}

export interface NarrationResult {
  trends: NarratedTrend[]
  cost: number
}

// --- Velocity Detection ---

const VELOCITY_THRESHOLD = 3     // min items in 14-day window
const VELOCITY_WINDOW_DAYS = 14

/**
 * Detect containers with accelerating activity.
 * A container is "hot" if it gained >= 3 items in the last 14 days.
 */
export async function detectVelocity(
  supabase: any,
  userId: string
): Promise<VelocitySignal[]> {
  // Get all containers for this user
  const { data: containers, error: cErr } = await supabase
    .from('containers')
    .select('id, name, item_count')
    .eq('user_id', userId)

  if (cErr || !containers || containers.length === 0) return []

  // Get recent container_items with item captured_at
  const cutoff = new Date(Date.now() - VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const containerIds = containers.map((c: any) => c.id)

  const { data: recentItems, error: iErr } = await supabase
    .from('container_items')
    .select('container_id, items!inner(captured_at)')
    .in('container_id', containerIds)
    .gte('items.captured_at', cutoff)

  if (iErr || !recentItems) return []

  // Count items per container in the window
  const countByContainer = new Map<string, number>()
  for (const row of recentItems) {
    const count = countByContainer.get(row.container_id) || 0
    countByContainer.set(row.container_id, count + 1)
  }

  // Build signals for containers above threshold
  const signals: VelocitySignal[] = []
  for (const container of containers) {
    const count = countByContainer.get(container.id) || 0
    if (count >= VELOCITY_THRESHOLD) {
      signals.push({
        type: 'velocity',
        containerId: container.id,
        containerName: container.name,
        itemCount14d: count,
      })
    }
  }

  return signals
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/trends.ts src/lib/trends.test.ts
git commit -m "feat: add velocity trend detector (MOL-6)"
```

---

## Task 3: Emergence Detector

**Files:**
- Modify: `src/lib/trends.test.ts` (add tests)
- Modify: `src/lib/trends.ts` (add detector)

**Step 1: Write failing tests for emergence detection**

Append to `src/lib/trends.test.ts`:

```typescript
describe('detectEmergence', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects interests first seen in last 14 days with >= 2 occurrences', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [
                { interest_type: 'topic', value: 'context-engineering', occurrence_count: 3, first_seen: recentDate },
                { interest_type: 'tool', value: 'new-tool', occurrence_count: 2, first_seen: recentDate },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }))

    const { detectEmergence } = await import('./trends')
    const signals = await detectEmergence(supabase, 'user-1')

    expect(signals).toHaveLength(2)
    expect(signals[0].value).toBe('context-engineering')
    expect(signals[0].occurrenceCount).toBe(3)
  })

  it('returns empty when no new interests meet threshold', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    }))

    const { detectEmergence } = await import('./trends')
    const signals = await detectEmergence(supabase, 'user-1')

    expect(signals).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: FAIL with "detectEmergence is not a function"

**Step 3: Add emergence detector to `src/lib/trends.ts`**

Append after the velocity detector:

```typescript
// --- Emergence Detection ---

const EMERGENCE_THRESHOLD = 2      // min occurrences for a new interest
const EMERGENCE_WINDOW_DAYS = 14

/**
 * Detect newly emerging interests.
 * An interest is "emerging" if first_seen is within 14 days and occurrence_count >= 2.
 */
export async function detectEmergence(
  supabase: any,
  userId: string
): Promise<EmergenceSignal[]> {
  const cutoff = new Date(Date.now() - EMERGENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('user_interests')
    .select('interest_type, value, occurrence_count, first_seen')
    .eq('user_id', userId)
    .gte('first_seen', cutoff)
    .gte('occurrence_count', EMERGENCE_THRESHOLD)

  if (error || !data) return []

  return data.map((row: any) => ({
    type: 'emergence' as const,
    interestType: row.interest_type,
    value: row.value,
    occurrenceCount: row.occurrence_count,
    firstSeen: row.first_seen,
  }))
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/trends.ts src/lib/trends.test.ts
git commit -m "feat: add emergence trend detector (MOL-6)"
```

---

## Task 4: Convergence Detector

**Files:**
- Modify: `src/lib/trends.test.ts` (add tests)
- Modify: `src/lib/trends.ts` (add detector)

**Step 1: Write failing tests for convergence detection**

Append to `src/lib/trends.test.ts`:

```typescript
describe('detectConvergence', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects container pairs sharing >= 2 recent items', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any
    const mockRpc = vi.fn()
    supabase.rpc = mockRpc

    // Mock containers for name lookup
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'c-1', name: 'AI Tooling' },
            { id: 'c-2', name: 'Game Design' },
          ],
          error: null,
        }),
      }),
    }))

    // Mock RPC for convergence query
    mockRpc.mockResolvedValue({
      data: [
        { container_a: 'c-1', container_b: 'c-2', shared_count: 3 },
      ],
      error: null,
    })

    const { detectConvergence } = await import('./trends')
    const signals = await detectConvergence(supabase, 'user-1')

    expect(signals).toHaveLength(1)
    expect(signals[0].containerA.name).toBe('AI Tooling')
    expect(signals[0].containerB.name).toBe('Game Design')
    expect(signals[0].sharedItems).toBe(3)
  })

  it('returns empty when no containers overlap', async () => {
    const mockFrom = vi.fn()
    const supabase = { from: mockFrom } as any
    const mockRpc = vi.fn()
    supabase.rpc = mockRpc

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'c-1', name: 'A' }],
          error: null,
        }),
      }),
    }))

    mockRpc.mockResolvedValue({ data: [], error: null })

    const { detectConvergence } = await import('./trends')
    const signals = await detectConvergence(supabase, 'user-1')

    expect(signals).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: FAIL with "detectConvergence is not a function"

**Step 3: Add convergence detector to `src/lib/trends.ts`**

Append after the emergence detector:

```typescript
// --- Convergence Detection ---

const CONVERGENCE_THRESHOLD = 2    // min shared items between container pair
const CONVERGENCE_WINDOW_DAYS = 30

/**
 * Detect containers whose content is converging.
 * Two containers are converging if they share >= 2 items captured in the last 30 days.
 * Uses an RPC function for the cross-join query.
 */
export async function detectConvergence(
  supabase: any,
  userId: string
): Promise<ConvergenceSignal[]> {
  // Get containers for name lookup
  const { data: containers, error: cErr } = await supabase
    .from('containers')
    .select('id, name')
    .eq('user_id', userId)

  if (cErr || !containers || containers.length < 2) return []

  const containerMap = new Map<string, string>()
  for (const c of containers) {
    containerMap.set(c.id, c.name)
  }

  // Find shared items between container pairs
  const cutoff = new Date(Date.now() - CONVERGENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase.rpc('detect_container_convergence', {
    p_user_id: userId,
    p_cutoff: cutoff,
    p_threshold: CONVERGENCE_THRESHOLD,
  })

  if (error || !data) return []

  return data
    .filter((row: any) => containerMap.has(row.container_a) && containerMap.has(row.container_b))
    .map((row: any) => ({
      type: 'convergence' as const,
      containerA: { id: row.container_a, name: containerMap.get(row.container_a)! },
      containerB: { id: row.container_b, name: containerMap.get(row.container_b)! },
      sharedItems: row.shared_count,
    }))
}
```

**Step 4: Create the convergence RPC function migration**

Add to `supabase/migrations/20260221_trends.sql` (append before the RLS section):

```sql
-- RPC function for convergence detection (cross-join is complex for PostgREST)
CREATE OR REPLACE FUNCTION detect_container_convergence(
  p_user_id UUID,
  p_cutoff TIMESTAMPTZ,
  p_threshold INT
)
RETURNS TABLE(container_a UUID, container_b UUID, shared_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    ci1.container_id AS container_a,
    ci2.container_id AS container_b,
    COUNT(*) AS shared_count
  FROM container_items ci1
  JOIN container_items ci2
    ON ci1.item_id = ci2.item_id
    AND ci1.container_id < ci2.container_id
  JOIN items i ON i.id = ci1.item_id
  JOIN containers c1 ON c1.id = ci1.container_id AND c1.user_id = p_user_id
  JOIN containers c2 ON c2.id = ci2.container_id AND c2.user_id = p_user_id
  WHERE i.captured_at >= p_cutoff
  GROUP BY ci1.container_id, ci2.container_id
  HAVING COUNT(*) >= p_threshold
$$;
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/trends.ts src/lib/trends.test.ts supabase/migrations/20260221_trends.sql
git commit -m "feat: add convergence trend detector with RPC function (MOL-6)"
```

---

## Task 5: LLM Narration Function

**Files:**
- Modify: `src/lib/trends.test.ts` (add tests)
- Modify: `src/lib/trends.ts` (add narration)

**Step 1: Write failing tests for narration**

Append to `src/lib/trends.test.ts`:

```typescript
describe('narrateTrends', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    process.env.OPENAI_API_KEY = 'test-api-key'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  it('narrates signals into human-readable trends', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              trends: [
                {
                  trendType: 'velocity',
                  title: 'Deep into agent orchestration',
                  description: "You've saved 5 items about agent orchestration in the last two weeks.",
                  strength: 0.8,
                },
              ],
            }),
          },
        }],
        usage: { prompt_tokens: 300, completion_tokens: 100 },
      }),
    })

    const { narrateTrends } = await import('./trends')
    const signals: any[] = [
      { type: 'velocity', containerId: 'c-1', containerName: 'Agent Orchestration', itemCount14d: 5 },
    ]

    const result = await narrateTrends(signals)

    expect(result).not.toBeNull()
    expect(result!.trends).toHaveLength(1)
    expect(result!.trends[0].title).toBe('Deep into agent orchestration')
    expect(result!.cost).toBeGreaterThan(0)
  })

  it('returns null when API key missing', async () => {
    delete process.env.OPENAI_API_KEY

    const { narrateTrends } = await import('./trends')
    const result = await narrateTrends([
      { type: 'velocity', containerId: 'c-1', containerName: 'Test', itemCount14d: 5 },
    ])

    expect(result).toBeNull()
  })

  it('returns null on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    })

    const { narrateTrends } = await import('./trends')
    const result = await narrateTrends([
      { type: 'velocity', containerId: 'c-1', containerName: 'Test', itemCount14d: 5 },
    ])

    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: FAIL with "narrateTrends is not a function"

**Step 3: Add narration function to `src/lib/trends.ts`**

Append after the convergence detector:

```typescript
// --- LLM Narration ---

/**
 * Use GPT-4o mini to generate human-readable trend descriptions.
 * Called once per user per cron run, only when signals exist.
 */
export async function narrateTrends(
  signals: TrendSignal[]
): Promise<NarrationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured')
    return null
  }

  const signalDescriptions = signals.map((s) => {
    switch (s.type) {
      case 'velocity':
        return `VELOCITY: Container "${s.containerName}" gained ${s.itemCount14d} items in the last 14 days.`
      case 'emergence':
        return `EMERGENCE: Interest "${s.value}" (${s.interestType}) appeared recently (first seen: ${s.firstSeen}) and already has ${s.occurrenceCount} occurrences.`
      case 'convergence':
        return `CONVERGENCE: Containers "${s.containerA.name}" and "${s.containerB.name}" share ${s.sharedItems} recent items.`
    }
  })

  const prompt = `You are a personal knowledge analyst. Given these detected signals about a user's saving patterns, generate concise, natural-language trend descriptions.

SIGNALS:
${signalDescriptions.join('\n')}

For each signal, generate:
- trendType: the signal type ("velocity", "emergence", or "convergence")
- title: 3-6 word phrase (e.g., "Deep into agent orchestration")
- description: one conversational sentence addressed to the user with "you" (e.g., "You've saved 5 items about agent orchestration in the last two weeks.")
- strength: 0.0-1.0 based on signal intensity (higher count/more overlap = stronger)

Return ONLY valid JSON, no markdown:
{"trends": [{"trendType": "...", "title": "...", "description": "...", "strength": 0.8}]}`

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
        temperature: 0.3,
        max_tokens: 500,
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
      console.error('No response from OpenAI for trend narration')
      return null
    }

    const usage = data.usage || {}
    const cost = (usage.prompt_tokens || 0) * OPENAI_INPUT_PRICE +
                 (usage.completion_tokens || 0) * OPENAI_OUTPUT_PRICE

    const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    // Attach original signals to each trend for storage
    const trends: NarratedTrend[] = (parsed.trends || []).map((t: any, i: number) => ({
      trendType: t.trendType,
      title: t.title,
      description: t.description,
      strength: Math.min(1.0, Math.max(0.0, t.strength || 0.5)),
      signals: signals[i] || signals[0], // map back to source signal
    }))

    return { trends, cost }
  } catch (error) {
    console.error('Trend narration error:', error)
    return null
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/trends.ts src/lib/trends.test.ts
git commit -m "feat: add LLM narration for detected trends (MOL-6)"
```

---

## Task 6: Inngest Cron Function

**Files:**
- Create: `src/inngest/functions/detect-trends.ts`
- Modify: `src/inngest/functions/index.ts`

**Step 1: Create the cron function**

```typescript
// src/inngest/functions/detect-trends.ts
// Daily trend detection cron — runs at 4am UTC (after 3am merge sweep)

import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase";
import {
  detectVelocity,
  detectEmergence,
  detectConvergence,
  narrateTrends,
  TrendSignal,
} from "@/lib/trends";

export const detectTrends = inngest.createFunction(
  {
    id: "detect-trends",
    retries: 1,
  },
  { cron: "0 4 * * *" }, // Daily at 4am UTC
  async ({ step }) => {
    const supabase = createServiceClient();

    // Step 1: Get all users with interests (active users)
    const users = await step.run("get-users", async () => {
      const { data } = await supabase
        .from("user_interests")
        .select("user_id")
        .order("user_id");

      const uniqueUserIds = [...new Set(data?.map((i) => i.user_id) || [])];
      return uniqueUserIds;
    });

    let totalTrends = 0;

    for (const userId of users) {
      // Step 2: Run all three detectors
      const signals = await step.run(
        `detect-signals-${userId}`,
        async () => {
          const [velocity, emergence, convergence] = await Promise.all([
            detectVelocity(supabase, userId),
            detectEmergence(supabase, userId),
            detectConvergence(supabase, userId),
          ]);

          return [
            ...velocity,
            ...emergence,
            ...convergence,
          ] as TrendSignal[];
        }
      );

      if (signals.length === 0) continue;

      // Step 3: Narrate signals via LLM
      const narrated = await step.run(
        `narrate-trends-${userId}`,
        async () => {
          return await narrateTrends(signals);
        }
      );

      if (!narrated || narrated.trends.length === 0) continue;

      // Step 4: Upsert trends into DB
      await step.run(`store-trends-${userId}`, async () => {
        const expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        for (const trend of narrated.trends) {
          await supabase.from("trends").upsert(
            {
              user_id: userId,
              trend_type: trend.trendType,
              title: trend.title,
              description: trend.description,
              signals: trend.signals,
              strength: trend.strength,
              detected_at: new Date().toISOString(),
              expires_at: expiresAt,
              surfaced: false,
            },
            { onConflict: "user_id,trend_type,title" }
          );
        }

        totalTrends += narrated.trends.length;
        console.log(
          `Stored ${narrated.trends.length} trends for user ${userId}, narration cost: $${narrated.cost.toFixed(6)}`
        );
      });
    }

    // Step 5: Clean up expired trends
    await step.run("cleanup-expired", async () => {
      const { error } = await supabase
        .from("trends")
        .delete()
        .lt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Failed to clean up expired trends:", error);
      }
    });

    return { usersProcessed: users.length, trendsStored: totalTrends };
  }
);
```

**Step 2: Register in index**

Update `src/inngest/functions/index.ts`:

```typescript
import { processItem } from "./process-item";
import { discoverContent } from "./discover";
import { mergeContainers } from "./merge-containers";
import { detectTrends } from "./detect-trends";

// Export all Inngest functions for the serve handler
export const functions = [processItem, discoverContent, mergeContainers, detectTrends];
```

**Step 3: Commit**

```bash
git add src/inngest/functions/detect-trends.ts src/inngest/functions/index.ts
git commit -m "feat: add daily trend detection cron (MOL-6)"
```

---

## Task 7: Digest Integration

**Files:**
- Modify: `src/lib/digest/generator.ts:38-53` (add TrendItem to DigestInput)
- Modify: `src/lib/digest/generator.ts:101-146` (add trends to prompt)
- Modify: `src/lib/digest/index.ts:21-146` (fetch and surface trends)

**Step 1: Add TrendItem type and update DigestInput in `src/lib/digest/generator.ts`**

Add after the `MemoItem` interface (line ~36):

```typescript
export interface TrendItem {
  id: string
  trendType: string
  title: string
  description: string
  strength: number
}
```

Update `DigestInput` to include trends:

```typescript
export interface DigestInput {
  user: {
    id: string
    displayName: string | null
    timezone: string
    mollyContext: string | null
  }
  items: DigestItem[]
  memos: MemoItem[]
  trends: TrendItem[]  // Detected trends
  previousDigest: {
    id: string
    scriptText: string
    generatedAt: Date
    itemCount: number
  } | null
}
```

**Step 2: Add trends section to the system prompt in `generateScript`**

In `generateScript`, after the memos section (around line 144), add a trends section. The full prompt rewrite for the relevant section:

Insert before `## Molly's Discoveries`:

```
## Trends (${input.trends.length} detected)
${input.trends.length > 0 ? `These are patterns I've noticed in your saving behavior:
${JSON.stringify(input.trends.map(t => ({
  type: t.trendType,
  title: t.title,
  description: t.description,
})), null, 2)}

Mention these trends FIRST, before covering individual items. Lead with the most interesting trend.
Say something like "I've been noticing a pattern..." or "Something interesting about your saves lately..."
Keep each trend to 1-2 sentences.` : 'No trends detected right now.'}
```

**Step 3: Update `src/lib/digest/index.ts` to fetch and surface trends**

Add a `getPendingTrends` function after `getPendingMemos`:

```typescript
// Get unsurfaced, non-expired trends for a user
async function getPendingTrends(userId: string): Promise<TrendItem[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('trends')
    .select('id, trend_type, title, description, strength')
    .eq('user_id', userId)
    .eq('surfaced', false)
    .gt('expires_at', new Date().toISOString())
    .order('strength', { ascending: false })
    .limit(3) // Max 3 trends per digest

  if (error) {
    console.error('Error fetching pending trends:', error)
    return []
  }

  return (data || []).map((t) => ({
    id: t.id,
    trendType: t.trend_type,
    title: t.title,
    description: t.description,
    strength: t.strength,
  }))
}
```

Add `TrendItem` to the import from `./generator`.

In `generateAndSendDigest`, after `const memos = await getPendingMemos(user.id)` add:

```typescript
  // 1c. Get pending trends
  const trends = await getPendingTrends(user.id)
```

Pass `trends` into `generateScript`:

```typescript
  const { script, cost: scriptCost } = await generateScript({
    user: { ... },
    items,
    memos,
    trends,
    previousDigest,
  })
```

After marking memos as shown, mark trends as surfaced:

```typescript
  // 9. Mark trends as surfaced
  if (trends.length > 0) {
    await markTrendsAsSurfaced(trends.map(t => t.id))
    console.log(`Marked ${trends.length} trends as surfaced`)
  }
```

Add the helper:

```typescript
async function markTrendsAsSurfaced(trendIds: string[]): Promise<void> {
  const supabase = createServiceClient()

  await supabase
    .from('trends')
    .update({ surfaced: true })
    .in('id', trendIds)
}
```

**Step 4: Run build to verify no type errors**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm run build`

Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/lib/digest/generator.ts src/lib/digest/index.ts
git commit -m "feat: integrate trends into daily digest (MOL-6)"
```

---

## Task 8: API Endpoint

**Files:**
- Create: `src/app/api/trends/route.ts`

**Step 1: Create the endpoint**

```typescript
// src/app/api/trends/route.ts
// GET /api/trends — returns active trends for a user
// Protected by CRON_SECRET (for Sidespace agent access)

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')

  // Auth: require CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id query parameter required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('trends')
    .select('trend_type, title, description, strength, detected_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('strength', { ascending: false })

  if (error) {
    console.error('Error fetching trends:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trends' },
      { status: 500 }
    )
  }

  return NextResponse.json({ trends: data || [] })
}
```

**Step 2: Run build to verify**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/trends/route.ts
git commit -m "feat: add GET /api/trends endpoint (MOL-6)"
```

---

## Task 9: Apply Migration and Verify

**Step 1: Apply the migration via Supabase MCP**

Run `mcp__supabase-mcfw__apply_migration` with the full SQL from Task 1 + Task 4 (trends table + convergence RPC function).

**Step 2: Verify tables and functions exist**

Run: `mcp__supabase-mcfw__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'trends';
```

And:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'detect_container_convergence';
```

**Step 3: Run full test suite**

Run: `cd /Users/matthewwalker/Development/mcfw/mollymemo && npm test -- src/lib/trends.test.ts`

Expected: All tests pass

**Step 4: Final commit with migration**

```bash
git add supabase/migrations/20260221_trends.sql
git commit -m "feat: apply trends migration to production (MOL-6)"
```
