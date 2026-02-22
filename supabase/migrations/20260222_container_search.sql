-- Container-aware search functions for MOL-8/MOL-9

-- match_items_v2: semantic search with optional container filter
CREATE OR REPLACE FUNCTION match_items_v2(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  match_container_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  summary text,
  domain text,
  content_type text,
  tags text[],
  github_url text,
  source_url text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.title,
    items.summary,
    items.domain,
    items.content_type,
    items.tags,
    items.github_url,
    items.source_url,
    1 - (items.embedding <=> query_embedding) as similarity
  FROM items
  WHERE items.user_id = match_user_id
    AND items.status = 'processed'
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
    AND (
      match_container_id IS NULL
      OR EXISTS (
        SELECT 1 FROM container_items ci
        WHERE ci.item_id = items.id
          AND ci.container_id = match_container_id
      )
    )
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- get_item_containers: batch lookup of container memberships for a set of item IDs
CREATE OR REPLACE FUNCTION get_item_containers(item_ids uuid[])
RETURNS TABLE (
  item_id uuid,
  container_id uuid,
  container_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.item_id,
    ci.container_id,
    c.name as container_name
  FROM container_items ci
  JOIN containers c ON c.id = ci.container_id
  WHERE ci.item_id = ANY(item_ids);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION match_items_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION match_items_v2 TO service_role;
GRANT EXECUTE ON FUNCTION get_item_containers TO authenticated;
GRANT EXECUTE ON FUNCTION get_item_containers TO service_role;
