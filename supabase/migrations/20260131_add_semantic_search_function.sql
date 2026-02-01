-- Semantic search function using pgvector
-- Accepts an embedding vector and returns similar items

CREATE OR REPLACE FUNCTION match_items(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
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
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant access to authenticated users and service role
GRANT EXECUTE ON FUNCTION match_items TO authenticated;
GRANT EXECUTE ON FUNCTION match_items TO service_role;
