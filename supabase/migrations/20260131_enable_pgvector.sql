-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search
-- Using HNSW for better performance on smaller datasets
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items
USING hnsw (embedding vector_cosine_ops);

-- Comment for documentation
COMMENT ON COLUMN items.embedding IS 'OpenAI text-embedding-3-small vector for semantic search';
