-- Interest graph tables for MollyMemo v2

-- User interests extracted from captured items
CREATE TABLE IF NOT EXISTS user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Interest classification
  interest_type TEXT NOT NULL, -- 'topic', 'tool', 'domain', 'person', 'repo'
  value TEXT NOT NULL,         -- 'react-three-fiber', 'cursor', '@levelsio'

  -- Weighting
  weight DECIMAL DEFAULT 0.5,        -- 0.0 to 1.0, decays over time
  occurrence_count INT DEFAULT 1,    -- How many times seen

  -- Timestamps
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness per user
  UNIQUE(user_id, interest_type, value)
);

-- Indexes for fast lookups
CREATE INDEX idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX idx_user_interests_weight ON user_interests(user_id, weight DESC);
CREATE INDEX idx_user_interests_type ON user_interests(user_id, interest_type);

-- Memos table for Molly's discoveries
CREATE TABLE IF NOT EXISTS memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Source
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL, -- 'hackernews', 'reddit', 'twitter'
  external_id TEXT,              -- Platform-specific ID for deduping

  -- Content
  title TEXT,
  summary TEXT,

  -- Relevance
  relevance_score DECIMAL,           -- 0.0 to 1.0
  relevance_reason TEXT,             -- "Because you saved 3 R3F items"
  matched_interests JSONB,           -- Which interests triggered this

  -- Status
  status TEXT DEFAULT 'pending',     -- 'pending', 'pinged', 'shown', 'captured', 'dismissed'

  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  shown_at TIMESTAMPTZ,

  -- Prevent duplicates
  UNIQUE(user_id, source_url)
);

-- Indexes
CREATE INDEX idx_memos_user_status ON memos(user_id, status);
CREATE INDEX idx_memos_discovered ON memos(user_id, discovered_at DESC);

-- RLS policies
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

-- Users can only see their own interests
CREATE POLICY "Users can view own interests" ON user_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own memos" ON memos
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for backend processing)
CREATE POLICY "Service role full access to interests" ON user_interests
  FOR ALL USING (true);

CREATE POLICY "Service role full access to memos" ON memos
  FOR ALL USING (true);
