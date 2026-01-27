# Cost Tracking Design

Track API costs for visibility into what LazyList is spending.

## Requirements

- Show current month stats in a compact row under the logo
- Link to history page with monthly breakdown and all-time totals
- Average cost per entry metric
- WCAG-compliant contrast in light and dark modes

## Data Model

Add cost columns per provider to items table:

```sql
ALTER TABLE items ADD COLUMN openai_cost DECIMAL(10,6);
ALTER TABLE items ADD COLUMN grok_cost DECIMAL(10,6);
```

Separate columns allow easy aggregation by provider. Total cost = `openai_cost + grok_cost`.

### Pricing (as of Jan 2026)

| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| OpenAI | gpt-4o-mini | $0.15/1M tokens | $0.60/1M tokens |
| xAI | grok-4-1-fast | $3/1M tokens | $15/1M tokens |

### Queries

```sql
-- Current month stats
SELECT
  COUNT(*),
  SUM(COALESCE(openai_cost, 0) + COALESCE(grok_cost, 0)) as total_cost,
  AVG(COALESCE(openai_cost, 0) + COALESCE(grok_cost, 0)) as avg_cost
FROM items
WHERE captured_at >= date_trunc('month', now())
  AND (openai_cost IS NOT NULL OR grok_cost IS NOT NULL);

-- Monthly breakdown with provider split
SELECT
  date_trunc('month', captured_at) as month,
  COUNT(*),
  SUM(COALESCE(openai_cost, 0)) as openai_total,
  SUM(COALESCE(grok_cost, 0)) as grok_total,
  SUM(COALESCE(openai_cost, 0) + COALESCE(grok_cost, 0)) as total_cost,
  AVG(COALESCE(openai_cost, 0) + COALESCE(grok_cost, 0)) as avg_cost
FROM items
WHERE openai_cost IS NOT NULL OR grok_cost IS NOT NULL
GROUP BY month
ORDER BY month DESC;
```

## UI: Stats Row

Compact row below logo, above FilterBar.

**Format:**
```
Jan 2026: 15 days • 32 entries • $0.08 avg • $2.56 total  [View History →]
```

- Current month name + days elapsed
- Entry count, average cost, total for month
- Link to `/stats` route
- If no entries: "Jan 2026: No entries yet"
- Small, muted text that doesn't compete with main content

## UI: History Page

**Route:** `/stats`

**Layout:**
```
← Back to List

Cost History

All Time
  143 entries • $0.07 avg • $11.42 total
    GPT-4o-mini: $6.24
    Grok: $5.18

January 2026
  32 entries • $0.08 avg • $2.56 total
    GPT-4o-mini: $1.20
    Grok: $1.36

December 2025
  48 entries • $0.06 avg • $2.88 total
    GPT-4o-mini: $1.44
    Grok: $1.44
...
```

- Back link to main list
- All-time summary at top with provider breakdown
- Months in reverse chronological order with provider breakdown
- Only months with entries shown
- Provider breakdown indented under each period

## Implementation

### Cost Calculation

**classifier.ts (OpenAI):**
- Parse `usage.prompt_tokens` and `usage.completion_tokens` from response
- Calculate: `(prompt_tokens * 0.15 + completion_tokens * 0.60) / 1_000_000`
- Return cost with classification result

**grok.ts (xAI):**
- Parse `usage.input_tokens` and `usage.output_tokens` from response
- Calculate: `(input_tokens * 3 + output_tokens * 15) / 1_000_000`
- Return cost with content result

**processItem():**
- Collect costs from each API call
- Update item record with `openai_cost` and `grok_cost` separately

### Edge Cases

- Failed API calls: cost = 0 (item fails, no cost recorded)
- Retries: included if retry succeeds
- Pre-existing items: cost columns = NULL, excluded from averages
- Items using only one provider: other provider's cost = NULL or 0

## Files to Create/Modify

- `src/lib/processors/classifier.ts` - return cost from classify()
- `src/lib/processors/grok.ts` - return cost from Grok functions
- `src/lib/processors/index.ts` - aggregate costs, update item
- `src/components/StatsRow.tsx` - new component for stats row
- `src/app/stats/page.tsx` - new history page
- `src/lib/supabase.ts` - add cost query functions
- Migration for `processing_cost` column
