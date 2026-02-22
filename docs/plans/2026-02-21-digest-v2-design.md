# MOL-7: Digest v2 — Insight-Driven with Configurable Cadence

**Date:** 2026-02-21
**Ticket:** MOL-7
**Status:** Design approved

## Overview

Upgrade the daily digest from a recap-style item walkthrough to an insight-first experience. Molly leads with what's *interesting* about the user's behavior (patterns, connections, project relevance) and references specific items as evidence. Add configurable cadence (daily/weekly/never) with day-of-week selection for weekly.

## Data Model Changes

### Migration

```sql
-- Add new columns
ALTER TABLE users ADD COLUMN digest_frequency TEXT DEFAULT 'daily';
ALTER TABLE users ADD COLUMN digest_day INTEGER DEFAULT 1; -- 0=Sun, 1=Mon, ..., 6=Sat

-- Migrate existing data
UPDATE users SET digest_frequency = 'daily' WHERE digest_enabled = true;
UPDATE users SET digest_frequency = 'never' WHERE digest_enabled = false;

-- Drop old column
ALTER TABLE users DROP COLUMN digest_enabled;
```

- `digest_frequency`: `'daily'` | `'weekly'` | `'never'`
- `digest_day`: 0-6 (0=Sunday through 6=Saturday), default 1 (Monday). Only used when frequency is weekly.

## Digest Data Assembly

Six data sources fetched in parallel before script generation. Window is 24h for daily, 7d for weekly.

### Existing sources (unchanged)

1. **Items** — all items captured in the digest window, status='processed'
2. **Trends** — up to 3 unsurfaced, unexpired trends
3. **Memos** — up to 5 pending Molly discoveries

### New sources

4. **Container activity** — for each container with items in the window:
   - Container name, item count in window, total item count
   - Whether it was created in the window (new container)
   - Query: join `container_items` → `containers` where item `captured_at` is within window

5. **Cross-references** — items appearing in 2+ containers within the window:
   - Item title, source URL, list of container names
   - Query: group `container_items` by `item_id` having count >= 2, join item and container details

6. **Project matches** — for each active project anchor, items whose interests overlap with project tags:
   - Project name, description, list of matched items with titles
   - Match logic: intersection of item extracted interests/tags with project anchor tags
   - No LLM call — pure tag intersection
   - Query: fetch project anchors, fetch items with interests, compute overlap in application code

### New functions in `src/lib/digest/index.ts`

```typescript
getContainerActivity(userId: string, since: Date): Promise<ContainerActivity[]>
getCrossReferences(userId: string, since: Date): Promise<CrossReference[]>
getProjectMatches(userId: string, since: Date): Promise<ProjectMatch[]>
```

## Prompt Restructure

### Current structure (v1)
1. Greeting → continuity hook → overview → items by domain → close
2. Trends mentioned first, then items enumerated

### New structure (v2) — insight-first

**Layer 1: Insights (lead)**
- Trends (behavioral patterns)
- Cross-references (items bridging multiple containers)
- Project connections (items mapping to active projects)
- Container activity (which buckets are hot, any new ones)

**Layer 2: Items (supporting evidence)**
- Items grouped by domain (same data as today)
- Molly references items *in service of insights*, not as an enumeration
- Daily: can mention most items but through the lens of patterns
- Weekly: picks 5-8 standout items, skips the rest

**Layer 3: Forward-looking close**
- Brief observation about trajectory
- Informed by project anchors + trend directions

### Key prompt instructions

- "Lead with what's interesting about the user's behavior, not what they saved"
- "Reference specific items as evidence for patterns, don't just list them"
- "If an item connects to a project, say so"
- Weekly variant: "Summarize the week's shape in ~5 minutes, spotlight 5-8 items max"

### Script length
- Daily: ~700-1000 words (unchanged)
- Weekly: ~700-1000 words (summary style, not longer)

## Cron Logic

### Current
Hourly cron checks `digest_enabled=true`, matches `digest_time` hour in user's timezone.

### New
- `digest_frequency='daily'`: match `digest_time` hour (unchanged behavior)
- `digest_frequency='weekly'`: match `digest_time` hour AND match `digest_day` against current day of week in user's timezone
- `digest_frequency='never'`: skip

Pass frequency to `generateAndSendDigest()` so it computes the correct window (24h vs 7d).

## Settings UI

### Changes to `/settings` page
- Replace on/off digest toggle with three-way selector: Daily / Weekly / Never
- Keep existing time picker (applies to both daily and weekly)
- Add day-of-week picker, visible only when Weekly is selected

### API changes
- Update `PUT /api/users/settings` to accept `digest_frequency` and `digest_day`
- Remove `digest_enabled` from the API

## Testing

- **Data assembly:** unit tests for `getContainerActivity()`, `getCrossReferences()`, `getProjectMatches()`
- **Cron scheduling:** tests for daily/weekly/never logic, day-of-week matching
- **Prompt:** verify new data sections are included in generated prompt
- **Migration:** verify data migration from `digest_enabled` to `digest_frequency`

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/20260221_digest_v2.sql` | New migration |
| `src/lib/digest/index.ts` | Add 3 new data fetchers, update orchestrator |
| `src/lib/digest/generator.ts` | Restructure prompt, add weekly variant |
| `src/lib/supabase.ts` | Update User type (frequency/day replace enabled) |
| `src/app/api/cron/digest/route.ts` | Update scheduling logic |
| `src/app/settings/page.tsx` | Frequency selector, day picker |
| `src/app/api/users/settings/route.ts` | Accept new fields |
| `src/lib/digest/index.test.ts` | Tests for new data functions |
