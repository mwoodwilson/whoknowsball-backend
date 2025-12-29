-- Opening odds tracking
CREATE TABLE IF NOT EXISTS public.opening_odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(255) NOT NULL,
  sport_key VARCHAR(50) NOT NULL,
  bookmaker VARCHAR(50) NOT NULL,
  market_type VARCHAR(20) NOT NULL,
  odds_data JSONB NOT NULL,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(game_id, bookmaker, market_type)
);

-- Closing odds tracking (T-2 minutes)
CREATE TABLE IF NOT EXISTS public.closing_odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(255) NOT NULL,
  sport_key VARCHAR(50) NOT NULL,
  bookmaker VARCHAR(50) NOT NULL,
  market_type VARCHAR(20) NOT NULL,
  odds_data JSONB NOT NULL,
  commence_time TIMESTAMP WITH TIME ZONE NOT NULL,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(game_id, bookmaker, market_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_opening_odds_game ON opening_odds(game_id);
CREATE INDEX IF NOT EXISTS idx_closing_odds_game ON closing_odds(game_id);
CREATE INDEX IF NOT EXISTS idx_closing_odds_commence ON closing_odds(commence_time);

-- RLS Policies
ALTER TABLE public.opening_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Opening odds readable by authenticated" ON public.opening_odds
  FOR SELECT USING (true);

CREATE POLICY "Closing odds readable by authenticated" ON public.closing_odds
  FOR SELECT USING (true);
