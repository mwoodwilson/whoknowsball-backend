-- Migration: Add odds_api_event_id to games table
-- Date: 2025-11-15
-- Purpose: Enable dual-source game identification (API-Sports primary, Odds API secondary)
--
-- CONTEXT:
-- This migration supports the shift to API-Sports as the primary game data source.
-- - Old architecture: Odds API IDs in 'id' column (game creation + odds)
-- - New architecture: API-Sports IDs in 'id' column, Odds API IDs in 'odds_api_event_id'
--
-- CRITICAL: This preserves existing bet references by copying current IDs to new column

-- Step 1: Add new column for Odds API event IDs
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS odds_api_event_id character varying;

-- Step 2: Migrate existing Odds API IDs to preserve bet references
-- IMPORTANT: This ensures existing bets (which reference current 'id' column) continue to work
-- After GameCreationJob runs, new games will have API-Sports IDs in 'id' column
UPDATE public.games
SET odds_api_event_id = id
WHERE odds_api_event_id IS NULL;

-- Step 3: Create index for faster Odds API lookups
-- OddsMatchingJob will use this column to link Odds API events to API-Sports games
CREATE INDEX IF NOT EXISTS idx_games_odds_api_event_id
ON public.games(odds_api_event_id);

-- Step 4: Add column documentation
COMMENT ON COLUMN public.games.odds_api_event_id IS
'Odds API event ID - used for matching odds data to games created by API-Sports. Migrated from original id column to preserve bet references.';

-- Verification query (run after migration):
-- SELECT
--   id AS current_id,
--   odds_api_event_id,
--   home_team,
--   away_team,
--   completed
-- FROM public.games
-- WHERE completed = false
-- ORDER BY commence_time
-- LIMIT 10;
--
-- Expected: All existing games should have odds_api_event_id populated with their current ID
