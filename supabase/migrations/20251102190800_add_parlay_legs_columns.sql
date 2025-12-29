-- Add missing columns to parlay_legs table to match backend code expectations
-- Migration: Add sport_key, market, entry_opposing_odds_american, and market_type

ALTER TABLE public.parlay_legs
  ADD COLUMN IF NOT EXISTS sport_key VARCHAR(50),
  ADD COLUMN IF NOT EXISTS market VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entry_opposing_odds_american DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS market_type VARCHAR(20);

-- Add foreign key constraint for sport_key (references games.sport_key -> sport_configs.sport_key)
-- Note: sport_key should match the game's sport, so we can reference games table indirectly
ALTER TABLE public.parlay_legs
  ADD CONSTRAINT fk_parlay_legs_sport_key
  FOREIGN KEY (sport_key)
  REFERENCES public.sport_configs(sport_key);

-- Create index on sport_key for better query performance
CREATE INDEX IF NOT EXISTS idx_parlay_legs_sport_key ON public.parlay_legs(sport_key);

-- Create index on market for filtering by bet market type
CREATE INDEX IF NOT EXISTS idx_parlay_legs_market ON public.parlay_legs(market);

COMMENT ON COLUMN public.parlay_legs.sport_key IS 'Sport identifier (e.g., americanfootball_nfl, basketball_nba)';
COMMENT ON COLUMN public.parlay_legs.market IS 'Bet market type (e.g., h2h, spreads, totals)';
COMMENT ON COLUMN public.parlay_legs.entry_opposing_odds_american IS 'Opposing odds at time of bet placement for CLV calculation';
COMMENT ON COLUMN public.parlay_legs.market_type IS 'Market structure (2way, 3way) for BKS calculation';
