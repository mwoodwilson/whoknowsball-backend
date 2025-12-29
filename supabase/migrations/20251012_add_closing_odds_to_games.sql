-- Migration: Add closing_odds_data to games table
-- Created: 2025-10-12
-- Purpose: Store closing odds snapshots for CLV calculation

-- Add closing_odds_data column if it doesn't exist
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS closing_odds_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.games.closing_odds_data IS 'Complete closing odds snapshot captured at T-30s before game start. Format: {captured_at, capture_window_seconds, bookmakers: [...], primary_odds: {home_american, away_american, draw_american}}';

-- Create GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_games_closing_odds_data ON public.games USING GIN (closing_odds_data);

-- Create index for games needing closing odds capture
CREATE INDEX IF NOT EXISTS idx_games_upcoming_no_closing ON public.games (commence_time) 
WHERE status = 'upcoming' AND closing_odds_data IS NULL;
