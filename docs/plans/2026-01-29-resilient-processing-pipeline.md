# Resilient Processing Pipeline Design

**Date:** 2026-01-29
**Status:** Approved
**Goal:** Make the item processing pipeline reliable, observable, and self-healing

## Problem Statement

Item #88 got stuck in `processing` status indefinitely. Root cause: Vercel's `after()` callback timed out during TikTok video processing, but the timeout wasn't caught—leaving the item orphaned with no error message and no way to recover automatically.

**Current issues:**
- No timeout protection in `after()` callbacks
- No visibility into processing steps (just `console.error`)
- No alerting when items fail
- Items can get permanently stuck in `processing` state
- Manual intervention required to discover and fix stuck items

## Solution Overview

Replace fire-and-forget `after()` callbacks with **Inngest** for job orchestration, plus **Sentry** for error tracking and alerting.

### Architecture

**Current flow:**
```
Telegram webhook → Insert item (pending) → after() callback → processItem() → ???
                                                                    ↓
                                                          (timeout = stuck forever)
```

**New flow:**
```
Telegram webhook → Insert item (pending) → inngest.send("item/captured")
                                                    ↓
                                           Inngest receives event
                                                    ↓
                                           processItem function runs
                                           (with steps, retries, timeouts)
                                                    ↓
                                           Success → status: processed
                                           Failure → status: failed + Sentry alert
```

### What This Solves

| Problem | Solution |
|---------|----------|
| Stuck items | Inngest tracks function state; timeouts are caught and surfaced |
| No visibility | Inngest dashboard shows step-by-step timeline for every item |
| No alerting | Sentry captures failures and sends Slack/email alerts |
| No self-healing | Inngest retries failed steps automatically (3 attempts) |
| Manual recovery | Failed items clearly marked with error messages |

## Technical Design

### Inngest Function Structure

The processing function uses Inngest's step functions to make each phase explicit and independently retriable:

```typescript
// src/inngest/functions/process-item.ts

export const processItem = inngest.createFunction(
  {
    id: "process-item",
    retries: 3,
    onFailure: async ({ error, event }) => {
      // Mark item as failed, capture to Sentry
    },
  },
  { event: "item/captured" },
  async ({ event, step }) => {
    const { itemId } = event.data;

    // Step 1: Fetch item and mark as processing
    const item = await step.run("fetch-item", async () => {
      // Get item from DB, set status to 'processing'
    });

    // Step 2: Source-specific extraction
    const extracted = await step.run("extract-content", async () => {
      // TikTok: download video, transcribe
      // X: fetch tweet, resolve URLs
      // Article: fetch and parse HTML
      // GitHub: fetch repo metadata
    });

    // Step 3: Classify with AI
    const classification = await step.run("classify", async () => {
      // Call OpenAI for title, summary, domain, tags
    });

    // Step 4: Save results
    await step.run("save-results", async () => {
      // Update item with all extracted data, status: 'processed'
    });

    // Step 5: Send follow-up message
    await step.run("notify-user", async () => {
      // Send Telegram message with title/summary
    });
  }
);
```

**Why steps matter:**
- If "extract-content" fails, Inngest retries just that step (not the whole function)
- Each step's duration and result is visible in the dashboard
- If "classify" times out, you see exactly where it died
- Steps can have individual timeout limits

### Sentry Integration

```typescript
// src/lib/sentry.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

**Error capture with context:**

```typescript
onFailure: async ({ error, event }) => {
  const { itemId, sourceType, sourceUrl } = event.data;

  Sentry.captureException(error, {
    tags: {
      processor: sourceType,      // "tiktok", "x", "article"
      itemId: itemId,
    },
    extra: {
      sourceUrl: sourceUrl,
      eventData: event.data,
    },
  });

  // Update item with failure
  await supabase
    .from("items")
    .update({
      status: "failed",
      error_message: error.message
    })
    .eq("id", itemId);
}
```

**What you get:**
- Slack/email alerts when items fail
- Error grouping (e.g., "TikTok transcription timeout" happened 5 times)
- Stack traces with source maps
- Tags for filtering (show all TikTok failures)

### Webhook Changes

**Current (Telegram webhook):**
```typescript
await sendMessage(chatId, "Got it! Processing...");

after(async () => {
  await processItem(item.id);
  // ... send follow-up message
});
```

**New:**
```typescript
await sendMessage(chatId, "Got it! Processing...");

await inngest.send({
  name: "item/captured",
  data: {
    itemId: item.id,
    sourceType: source_type,
    sourceUrl: source_url,
    userId: user_id,
    chatId: chatId,
  },
});
```

## File Structure

### New Files

```
src/
├── inngest/
│   ├── client.ts           # Inngest client initialization
│   └── functions/
│       ├── process-item.ts # Main processing function
│       └── index.ts        # Export all functions
├── lib/
│   └── sentry.ts           # Sentry initialization
app/
├── api/
│   └── inngest/
│       └── route.ts        # Inngest webhook endpoint
```

### Files to Modify

| File | Change |
|------|--------|
| `src/app/api/telegram/route.ts` | Replace `after()` + `processItem()` with `inngest.send()` |
| `src/app/api/items/[id]/route.ts` | Replace fire-and-forget retry with `inngest.send()` |
| `src/lib/processors/index.ts` | Keep logic, call from Inngest steps |
| `next.config.js` | Add Sentry webpack config |
| `package.json` | Add `inngest`, `@sentry/nextjs` |
| `.env.local` | Add `INNGEST_EVENT_KEY`, `SENTRY_DSN` |

### Unchanged

- All processor files (`tiktok.ts`, `x.ts`, `article.ts`, `github.ts`)
- `classifier.ts`, `repo-extractor.ts`
- Database schema
- Supabase client

## Implementation Plan

### Phase 1: Infrastructure Setup
1. Install dependencies (`inngest`, `@sentry/nextjs`)
2. Create Inngest client and API route
3. Initialize Sentry with Next.js config
4. Add environment variables
5. Verify Inngest dev server connects locally

### Phase 2: Create Processing Function
1. Create `process-item.ts` with step structure
2. Move processing logic into steps (extract, classify, save)
3. Add `onFailure` handler with Sentry capture
4. Add follow-up Telegram message as final step
5. Test locally with Inngest dev server

### Phase 3: Wire Up Webhooks
1. Update Telegram webhook to send Inngest event
2. Update retry endpoint to send Inngest event
3. Remove `after()` callbacks
4. Test end-to-end locally

### Phase 4: Deploy & Verify
1. Deploy to Vercel
2. Configure Inngest production environment
3. Test with real TikTok/article captures
4. Verify Sentry receives errors (trigger deliberate failure)
5. Confirm Inngest dashboard shows processing timeline

## Configuration

### Retry Strategy (Conservative)

```typescript
{
  retries: 3,
  backoff: {
    type: "exponential",
    minDelay: 1000,    // 1 second
    maxDelay: 60000,   // 1 minute
  }
}
```

After 3 failed attempts, item is marked as `failed` with error message. No automatic recovery—failures surface clearly for investigation.

### Environment Variables

```bash
# Inngest
INNGEST_EVENT_KEY=xxx        # For sending events
INNGEST_SIGNING_KEY=xxx      # For webhook verification

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx        # For source maps upload
```

## Success Criteria

1. **No stuck items** - Items either succeed or fail with clear error messages
2. **Visibility** - Can see processing timeline for any item in Inngest dashboard
3. **Alerting** - Get notified when items fail (Sentry → Slack/email)
4. **Debuggability** - When item #89 fails, can determine why within 2 minutes
5. **Retries work** - Transient failures (API rate limits) auto-recover

## Future Considerations

Once this foundation is solid:
- Add per-step timeouts (e.g., 60s for video download, 30s for classification)
- Consider dead-letter queue for items that fail repeatedly
- Add metrics dashboard (processing time by source type, failure rates)
- Evaluate if digest generation should also move to Inngest
