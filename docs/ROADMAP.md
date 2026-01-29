# MollyMemo Roadmap

## High Priority

### YouTube Processor
**Complexity:** Medium

Extract from YouTube URLs:
- Video title, description, channel
- Transcript via YouTube API (free) or Whisper (costly for long videos)
- Chapter markers if available
- Hybrid approach: try captions first, fall back to transcription

---

## Medium Priority

### Molly's Memos (Proactive Discovery)
**Complexity:** High

Transform Molly from passive capture to proactive research assistant. She learns your interests from captured links, then actively searches for related content you'd care about.

**Core Concept:**
- **List tab** - Your captures (existing)
- **Memos tab** - Molly's discoveries (new)
- **Digest enhancement** - First half: recap of your captures. Second half: "I also found these..."

**Interest Graph:**

Build from captured items:
```
user_interests:
  - id, user_id, interest_type, value, weight, last_seen

Examples:
  - (user_1, 'domain', 'vibe-coding', 0.8, now)
  - (user_1, 'tool', 'cursor', 0.6, now)
  - (user_1, 'topic', 'react-three-fiber', 0.9, now)
  - (user_1, 'person', '@levelsio', 0.5, now)
```

Extract from:
- `domain` field (vibe-coding, ai-filmmaking)
- `tags` array
- `extracted_entities` (repos, tools, techniques)
- Mentioned people/accounts
- Weight by recency and frequency

**Proactive Search Sources:**

| Source | Method | Rate Limit |
|--------|--------|------------|
| Reddit | Pushshift API or Reddit API | Moderate |
| X/Twitter | Grok API (already have) | Per-user |
| Hacker News | Algolia API (free) | Generous |
| GitHub Trending | Scrape or API | Daily |
| Product Hunt | API | Daily |

**Cron Job: `/api/cron/discover`**

Run daily (after digest, or separate schedule):
1. Load user's interest graph (top 10 weighted interests)
2. Build search queries: `"cursor ai" site:reddit.com last 7 days`
3. Fetch and dedupe against existing items
4. AI filter: "Would this user find this valuable?" (Claude Haiku, cheap)
5. Store as `memos` table with `source='molly'`

**Data Model:**

```sql
-- Memos table (Molly's discoveries)
CREATE TABLE memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  source_url TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  relevance_reason TEXT,  -- "Because you've saved 3 React Three Fiber repos"
  interest_match JSONB,   -- Which interests triggered this
  status TEXT DEFAULT 'pending',  -- pending, shown, dismissed, captured
  discovered_at TIMESTAMPTZ DEFAULT now()
);

-- Interest graph
CREATE TABLE user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  interest_type TEXT NOT NULL,  -- domain, tool, topic, person, repo
  value TEXT NOT NULL,
  weight DECIMAL DEFAULT 0.5,
  occurrence_count INT DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, interest_type, value)
);
```

**UI: Memos Tab**

```
/memos (or toggle on main page)

[Card]
  "New R3F camera controller library"
  reddit.com/r/threejs • 2 hours ago

  Because you saved 3 React Three Fiber items

  [Capture] [Dismiss]
```

**Digest Integration:**

```
Molly's voice digest script:

"...and that's your recap for today.

I also found a few things you might like. There's a new
Cursor extension for React that's getting attention on
Reddit. And someone posted a Three.js camera rig that
looks similar to that qwkshot project you're working on.

Check the Memos tab if you want to capture any of these."
```

**Inspiration:** [last30days-skill](https://github.com/mvanhorn/last30days-skill) - scrapes Reddit + X for recent discussions

**Implementation Order:**
1. Interest graph extraction (run on each capture)
2. `memos` table + basic API
3. Memos tab UI
4. Single source (HN Algolia - easiest)
5. AI relevance filtering
6. Digest integration
7. Additional sources (Reddit, X, GitHub)

---

### RAG-Powered Memory
**Complexity:** High

Evolve Molly's memory beyond the simple `molly_context` field:
- Embed past digests and items using OpenAI embeddings
- Store in Supabase pgvector
- RAG retrieval: "Two weeks ago you saved something similar..."
- Pattern detection: "You've saved 5 mapping tools this month"

**Trigger:** When KB grows beyond ~100 items per user

### Vector Search
**Complexity:** Medium

When items exceed ~500:
- Embed items on capture
- pgvector similarity search
- Power both MollyMemo skill and digest references

### Error Monitoring
**Complexity:** Low

Add Sentry or similar:
- Track runtime errors
- Alert on anomalies
- Performance monitoring

---

## Low Priority

### New Classifier Domains
**Complexity:** Low

Add domains beyond vibe-coding/ai-filmmaking:
1. Edit `src/lib/processors/classifier.ts`
2. Add domain to prompt with description
3. Update UI filters if needed

### Repo Metadata Display
**Complexity:** Low

Show GitHub repo details inline:
- Stars, description in item cards
- Dedicated `github_url` field for primary repo

### Feedback Collection
**Complexity:** Low

Let users reply to digest voice messages:
- Voice reply → transcribe → store as feedback
- Text reply → store directly
- Use feedback to tune future digests

### Web Player Fallback
**Complexity:** Medium

`/digest/[id]` page with:
- Audio player
- Transcript display
- Optional link in Telegram message

### Smart Deduplication
**Complexity:** Low

Detect near-duplicate items:
- Same URL with different query params
- Same repo linked from different tweets
- Merge or flag for user

### Distributed Rate Limiting
**Complexity:** Low

Replace in-memory rate limiting with Upstash Redis:
- Persist across cold starts
- Scale across multiple instances

### Braintrust Integration
**Complexity:** Medium

Observability for digest quality:
- Log all script generation calls
- Track quality scores over time
- A/B test prompt variations

---

## Ideas

### Knowledge Mindmap
**Complexity:** Medium

Visual mindmap of captured items using React Flow:
- Center node: user or time period
- Branch nodes: domains (vibe-coding, ai-filmmaking, etc.)
- Leaf nodes: individual items
- Connections: shared tags or extracted entities
- Interactive: click to expand, filter by domain/type

**Libraries:** [React Flow](https://reactflow.dev/learn/tutorials/mind-map-app-with-react-flow) (recommended), blink-mind-react

### Newsletter/Email Capture
**Complexity:** High

Forward emails to MollyMemo:
- Parse email content
- Extract links
- Summarize key points
