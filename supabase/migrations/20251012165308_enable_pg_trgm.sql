-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes on team names for faster similarity searches
CREATE INDEX IF NOT EXISTS idx_games_home_team_trgm ON games USING gin (home_team gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_games_away_team_trgm ON games USING gin (away_team gin_trgm_ops);

-- Add comment explaining the extension
COMMENT ON EXTENSION pg_trgm IS 'Provides trigram similarity matching for fuzzy text search on team names';
