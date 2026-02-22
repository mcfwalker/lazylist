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

-- RLS
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trends" ON trends
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to trends" ON trends
  FOR ALL USING (true);
