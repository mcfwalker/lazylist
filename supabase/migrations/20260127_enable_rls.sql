-- Enable Row Level Security on items and users tables
-- Run this in the Supabase SQL Editor

-- ============================================
-- ITEMS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own items
CREATE POLICY "Users can view own items"
ON items
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own items
CREATE POLICY "Users can insert own items"
ON items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own items
CREATE POLICY "Users can update own items"
ON items
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own items
CREATE POLICY "Users can delete own items"
ON items
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- USERS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own user record
CREATE POLICY "Users can view own profile"
ON users
FOR SELECT
USING (auth.uid() = id);

-- Policy: Users can update their own user record
CREATE POLICY "Users can update own profile"
ON users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================
-- NOTES
-- ============================================
--
-- The service role key (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS.
-- This is used for:
--   - Telegram webhook (creates items for users)
--   - Background processing (processItem)
--   - User lookup by telegram_user_id
--
-- The anon key respects RLS, so browser clients can only
-- access their own data after authentication.
