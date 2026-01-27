# Telegram Bot Design

Replace iOS Shortcut with a Telegram bot for capturing links. Works cross-platform, no device setup required.

## Why Telegram

- Native share sheet integration on iOS/Android
- No shortcut setup - just message the bot
- Chat history shows what you've captured
- Bot replies with processed results
- Easy to add new users (just add their ID to env)

## Architecture

**New endpoint:** `POST /api/telegram`

**Flow:**
1. User shares link to bot via Telegram
2. Telegram sends webhook to `/api/telegram`
3. Endpoint checks user ID against whitelist
4. Extracts URL from message
5. Inserts to DB, replies "Got it! Processing..."
6. Processes item using existing pipeline
7. Sends follow-up: "✓ [Title] - [Summary]"

**No new database tables** - same `items` table, just a new entry point.

## Environment Variables

```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...    # From @BotFather
TELEGRAM_ALLOWED_USERS=123456789,987654321  # Comma-separated user IDs
```

## Endpoint Implementation

**Route:** `src/app/api/telegram/route.ts`

**Incoming payload:**
```typescript
{
  message: {
    from: { id: 123456789 },
    chat: { id: 123456789 },
    text: "Check this out https://tiktok.com/..."
  }
}
```

**Response logic:**
- User not in whitelist → silent ignore
- No URL in message → "Send me a link to capture"
- Duplicate URL → "Already captured this recently"
- Success → "Got it! Processing..." then follow-up with result

**Telegram API:**
- Single method needed: `sendMessage`
- POST to `https://api.telegram.org/bot{token}/sendMessage`

## Setup

1. Create bot via @BotFather (`/newbot`)
2. Add `TELEGRAM_BOT_TOKEN` to Vercel env
3. Get user ID from @userinfobot
4. Add to `TELEGRAM_ALLOWED_USERS`
5. Deploy
6. Register webhook:
   ```
   curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://lazylist.mcfw.io/api/telegram"
   ```

**Adding new users:** They get their ID from @userinfobot, you add it to the env var.

## Error Handling

| Scenario | Response |
|----------|----------|
| Unknown user | Silent ignore |
| No URL in message | "Send me a link to capture" |
| Duplicate URL | "Already captured this recently" |
| Invalid URL | "That doesn't look like a valid URL" |
| Processing fails | "Failed to process - check the web app" |

Photo/video/sticker messages are silently ignored.

## Files to Create

- `src/app/api/telegram/route.ts` - webhook endpoint
- `src/lib/telegram.ts` - helper for sending messages

## Out of Scope

- Bot commands (`/recent`, `/search`, etc.) - can add later
- Inline mode
- Group chat support
- Message editing/deletion
