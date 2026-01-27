# LazyList Multi-User Support Plan

## Overview

Add user accounts so each person has isolated data. Keep it simple - custom auth with a users table, not Supabase Auth (overkill for invite-only tool).

## Database Changes

### 1. Create users table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  telegram_user_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_user_id ON users(telegram_user_id);
```

### 2. Add user_id to items table

```sql
ALTER TABLE items ADD COLUMN user_id UUID REFERENCES users(id);
CREATE INDEX idx_items_user_id ON items(user_id);
```

### 3. Migrate existing data

```sql
-- Insert owner as first user
INSERT INTO users (id, email, password_hash, display_name, telegram_user_id)
VALUES ('OWNER_UUID', 'matt@email.com', 'HASHED_PW', 'Matt', TELEGRAM_ID);

-- Assign existing items to owner
UPDATE items SET user_id = 'OWNER_UUID';

-- Make required
ALTER TABLE items ALTER COLUMN user_id SET NOT NULL;
```

## Code Changes

### Phase 1: Auth System

**`src/lib/security.ts`**
- Add `hashPassword()` and `verifyPassword()` functions
- Update `generateSessionToken()` to include `userId` in payload
- Add `getUserIdFromToken()` to extract user ID

**`src/app/api/auth/route.ts`**
- Change from single SITE_PASSWORD to email/password lookup
- Look up user in database, verify password hash
- Generate session token with user ID

**`src/middleware.ts`**
- Extract user ID from session token
- Pass to routes via `x-user-id` header

**`src/lib/auth.ts`** (new file)
- `getCurrentUserId()` helper to get user from request headers

### Phase 2: Data Isolation

**`src/app/api/items/route.ts`**
- Add `.eq('user_id', userId)` filter to all queries

**`src/app/api/items/[id]/route.ts`**
- Add user ownership check to GET, PATCH, DELETE, POST

**`src/lib/supabase.ts`**
- Update stats functions to filter by user_id
- Or move stats to API routes

### Phase 3: Telegram Integration

**`src/lib/telegram.ts`**
- Replace `isAllowedUser()` with `getUserByTelegramId()`
- Look up user in database by telegram_user_id

**`src/app/api/telegram/route.ts`**
- Look up user by Telegram ID
- Include `user_id` in item inserts
- Remove dependency on TELEGRAM_ALLOWED_USERS env var

### Phase 4: Frontend

**`src/app/login/page.tsx`**
- Change from password-only to email + password form

## Deprecate /api/capture

Remove the iOS Shortcut capture endpoint - Telegram is the primary capture method.

- Delete `src/app/api/capture/route.ts`
- Delete `src/app/api/capture/route.test.ts`
- Remove `API_SECRET_KEY` from env vars

## Env Var Changes

**Remove:**
- `SITE_PASSWORD` (replaced by per-user passwords)
- `TELEGRAM_ALLOWED_USERS` (managed in database)
- `API_SECRET_KEY` (capture endpoint deprecated)

**Keep:**
- `SITE_PASSWORD_HASH` (for session signing)
- Everything else

## Adding a New User

1. Get their Telegram user ID
2. Generate password hash
3. Insert into users table:
```sql
INSERT INTO users (email, password_hash, display_name, telegram_user_id)
VALUES ('friend@email.com', 'HASH', 'Friend', 12345678);
```
4. They can now log into web app and send links via Telegram

## Verification

1. **Login flow**: Email/password login creates session with user ID
2. **Web app**: User only sees their own items
3. **Telegram**: Sending link creates item for correct user
4. **Stats**: Shows only user's costs/counts

## Files to Modify

- `src/lib/security.ts` - password hashing, session tokens
- `src/lib/auth.ts` - new helper file
- `src/lib/telegram.ts` - user lookup by telegram ID
- `src/lib/supabase.ts` - types, stats filtering
- `src/app/api/auth/route.ts` - email/password login
- `src/app/api/items/route.ts` - filter by user
- `src/app/api/items/[id]/route.ts` - ownership checks
- `src/app/api/telegram/route.ts` - user lookup, user_id insert
- `src/app/login/page.tsx` - email + password form
- `src/middleware.ts` - pass user ID to routes
