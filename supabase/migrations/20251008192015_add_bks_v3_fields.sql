-- Migration: Add BKS v3.1.5 Fields for Enhanced CLV and Context Tracking
-- Created: 2025-10-08
-- Purpose: Support 3-way de-vigging, closing line value, and parlay correlation

-- Add new fields to bets table for BKS v3.1.5
ALTER TABLE public.bets
ADD COLUMN IF NOT EXISTS entry_opposing_odds_american INTEGER,
ADD COLUMN IF NOT EXISTS entry_draw_odds_american INTEGER,
ADD COLUMN IF NOT EXISTS closing_odds_data JSONB,
ADD COLUMN IF NOT EXISTS correlation DECIMAL(3,2) DEFAULT 0 CHECK (correlation >= 0 AND correlation <= 1),
ADD COLUMN IF NOT EXISTS context VARCHAR(50) DEFAULT 'regular';

-- Add comments for documentation
COMMENT ON COLUMN public.bets.entry_opposing_odds_american IS 'Opposing odds at bet placement for 2-way de-vigging';
COMMENT ON COLUMN public.bets.entry_draw_odds_american IS 'Draw odds at bet placement for 3-way markets';
COMMENT ON COLUMN public.bets.closing_odds_data IS 'Complete closing odds snapshot for CLV calculation. Format: {"odds_american": -110, "opposing_odds_american": -110, "draw_odds_american": 250, "line": -3.5, "ts": 1234567890}';
COMMENT ON COLUMN public.bets.correlation IS 'Parlay correlation factor (0=independent, 1=fully correlated). Used for Same Game Parlay (SGP) complexity adjustment.';
COMMENT ON COLUMN public.bets.context IS 'Game context for importance weighting: preseason, regular, playoffs, finals_contrarian';

-- Add similar fields to parlay_legs table
ALTER TABLE public.parlay_legs
ADD COLUMN IF NOT EXISTS entry_opposing_odds_american INTEGER,
ADD COLUMN IF NOT EXISTS entry_draw_odds_american INTEGER,
ADD COLUMN IF NOT EXISTS closing_odds_data JSONB;

COMMENT ON COLUMN public.parlay_legs.entry_opposing_odds_american IS 'Opposing odds at entry for this leg (2-way de-vig)';
COMMENT ON COLUMN public.parlay_legs.entry_draw_odds_american IS 'Draw odds at entry for this leg (3-way markets)';
COMMENT ON COLUMN public.parlay_legs.closing_odds_data IS 'Closing odds snapshot for this leg. Format: {"odds_american": -110, "opposing_odds_american": -110, "draw_odds_american": 250, "line": -3.5, "ts": 1234567890}';

-- Create index on context for filtering
CREATE INDEX IF NOT EXISTS idx_bets_context ON public.bets(context);

-- Create index on correlation for SGP analysis
CREATE INDEX IF NOT EXISTS idx_bets_correlation ON public.bets(correlation) WHERE correlation > 0;

-- Create GIN index on closing_odds_data for JSONB queries
CREATE INDEX IF NOT EXISTS idx_bets_closing_odds_data ON public.bets USING GIN (closing_odds_data);
CREATE INDEX IF NOT EXISTS idx_parlay_legs_closing_odds_data ON public.parlay_legs USING GIN (closing_odds_data);
