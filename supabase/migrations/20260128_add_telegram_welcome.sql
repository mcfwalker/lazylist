-- Add telegram_welcome_sent column to track if welcome message was sent
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_welcome_sent BOOLEAN DEFAULT FALSE;
