-- Project anchors: lightweight project awareness pushed by Sidespace
-- MollyMemo uses these as filing and relevance hints for containers/digests

CREATE TABLE IF NOT EXISTS project_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_project_id UUID NOT NULL,       -- Sidespace project UUID
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  stage TEXT,                              -- 'building', 'planning', 'shipped', etc.
  source TEXT DEFAULT 'sidespace',         -- Which app pushed this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, external_project_id)
);

-- Indexes
CREATE INDEX idx_project_anchors_user_id ON project_anchors(user_id);
CREATE INDEX idx_project_anchors_external ON project_anchors(external_project_id);

-- RLS
ALTER TABLE project_anchors ENABLE ROW LEVEL SECURITY;

-- Users can view their own project anchors
CREATE POLICY "Users can view own project anchors" ON project_anchors
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access (Sidespace pushes via service key)
CREATE POLICY "Service role full access to project anchors" ON project_anchors
  FOR ALL USING (true);
