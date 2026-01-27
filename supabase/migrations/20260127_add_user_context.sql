-- Add user_context field for Imogen's evolving memory
ALTER TABLE users ADD COLUMN IF NOT EXISTS imogen_context TEXT;
