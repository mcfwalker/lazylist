# Feature Requests

## UI/UX

### 1. Improve link visibility
**Priority:** High
**Status:** Done

~~Links are the same color as text, making them hard to differentiate.~~

**Solution:** Added `--link` and `--link-hover` CSS variables with orange color. Theme-friendly - just update the variables to change link colors globally.

---

## Data Processing

### 2. Surface extracted GitHub repos in UI
**Priority:** Medium
**Status:** Done (basic), enhancements possible

GitHub URLs mentioned in TikTok transcripts are already extracted and stored in `extracted_entities.repos`.

- [x] Display extracted repos in the expanded item card
- [ ] Consider adding a dedicated `github_url` field for the primary repo
- [ ] Show repo metadata (stars, description) inline

---

## System Extensibility

### 3. Add new domains (e.g., robotics)
**Priority:** Low
**Status:** Open

The classifier currently supports:
- `vibe-coding` - software dev, AI coding tools
- `ai-filmmaking` - video generation, AI video
- `other` - catch-all

To add new domains:
1. Edit `src/lib/processors/classifier.ts`
2. Add domain to the prompt with description
3. Update any UI filters

The AI handles categorization automatically based on content.

---

---

## Content Sources

### 4. YouTube support
**Priority:** Medium
**Status:** Open

Add YouTube video processing. Considerations:
- **Cost:** YouTube videos can be long-form (10min-2hr+). Transcription costs scale with duration.
- **Existing transcripts:** Many YouTube videos have auto-generated or creator-provided captions. Should check for existing transcripts via YouTube API before transcribing.
- **Options:**
  - Use YouTube captions API (free, may have quality issues)
  - Use Whisper/OpenAI transcription (costly for long videos)
  - Hybrid: try captions first, fall back to transcription
- **Rate limits:** YouTube API has quotas

---

## Operations

### 5. Cost tracking
**Priority:** Medium
**Status:** Open

Add visibility into API spending across:
- OpenAI (transcription, classification, repo extraction validation)
- xAI/Grok (X content fetching)
- GitHub API (repo metadata)

Options:
- Log token usage per request
- Daily/weekly aggregation
- Dashboard or simple CLI report
- Alert thresholds

---

## UI/UX

### 6. Fix yellow text contrast (light theme)
**Priority:** Medium
**Status:** Open

Yellow text has poor contrast on light backgrounds throughout the app. Need to:
- Audit all yellow color usage
- Adjust for WCAG contrast compliance
- Test on both light and dark themes

---

## Capture Flow

### 7. Understand/improve iOS Shortcut UX
**Priority:** High
**Status:** Open - needs investigation

Current issue: Some posts take a long time to process, disrupting the doomscroll flow. User has to wait for checkmark before moving on.

Questions to answer:
- What does the shortcut return to indicate completion?
- Is it waiting for the full pipeline (capture + process)?
- Can we make capture async so user can "send and scroll"?

**Current behavior:** The `/api/capture` endpoint has `await processItem(item.id)` on line 97, meaning the shortcut waits for the full pipeline (transcription, Grok fetch, classification) before returning success.

**Proposed fix:** Remove the `await` - return success immediately after DB insert, let processing run in background. The shortcut just needs confirmation the URL was received.

```typescript
// Current (blocking):
await processItem(item.id)

// Fix (fire-and-forget):
processItem(item.id).catch(err => console.error('Background processing error:', err))
```

**Trade-off:** If processing takes longer than Vercel's function timeout (~10s default, 60s max), it may be cut off. For long videos, might need a proper queue (Inngest, Trigger.dev) or Supabase Edge Functions.

---

### 8. Universal capture mechanism (SMS/WhatsApp)
**Priority:** Low
**Status:** Open - needs research

Allow capturing via text message or WhatsApp instead of iOS Shortcut.

Options:
- **Twilio SMS:** Receive texts at a number, parse URLs, submit to capture API
- **WhatsApp Business API:** Similar to SMS but requires business verification
- **Telegram Bot:** Easier to set up than WhatsApp, good for personal use
- **Email:** Forward links to a dedicated email address

Simplest path: Telegram bot (free, no verification, good API)

---

## Notes

- The system works for any topic - just add domains to the classifier prompt
- Auto-categorization is handled by GPT-4o Mini based on transcript/content analysis
