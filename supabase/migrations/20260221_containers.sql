-- Containers: durable named collections that items are filed into
-- Items can belong to multiple containers (many-to-many via container_items)

CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  item_count INT DEFAULT 0,            -- Denormalized for fast display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join table: items can live in multiple containers
CREATE TABLE IF NOT EXISTS container_items (
  container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (container_id, item_id)
);

-- Indexes
CREATE INDEX idx_containers_user_id ON containers(user_id);
CREATE INDEX idx_containers_user_name ON containers(user_id, name);
CREATE INDEX idx_container_items_item_id ON container_items(item_id);

-- Trigger to keep item_count in sync
CREATE OR REPLACE FUNCTION update_container_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE containers SET item_count = item_count + 1, updated_at = NOW()
    WHERE id = NEW.container_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE containers SET item_count = item_count - 1, updated_at = NOW()
    WHERE id = OLD.container_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_container_item_count
AFTER INSERT OR DELETE ON container_items
FOR EACH ROW EXECUTE FUNCTION update_container_item_count();

-- RLS
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own containers
CREATE POLICY "Users can view own containers" ON containers
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own containers
CREATE POLICY "Users can manage own containers" ON containers
  FOR ALL USING (auth.uid() = user_id);

-- Users can view container_items for their containers
CREATE POLICY "Users can view own container items" ON container_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM containers
      WHERE containers.id = container_items.container_id
      AND containers.user_id = auth.uid()
    )
  );

-- Service role has full access (for backend processing / container assignment engine)
CREATE POLICY "Service role full access to containers" ON containers
  FOR ALL USING (true);

CREATE POLICY "Service role full access to container items" ON container_items
  FOR ALL USING (true);
