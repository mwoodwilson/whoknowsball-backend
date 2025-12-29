-- Enable required extensions

-- =============================================
-- PHASE 1: CORE TABLES (MVP)
-- =============================================

-- 1. Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  overall_bks DECIMAL(5,1) DEFAULT 0.0 CHECK (overall_bks >= 0 AND overall_bks <= 100),
  total_bets INTEGER DEFAULT 0,
  total_won INTEGER DEFAULT 0,
  total_lost INTEGER DEFAULT 0,
  total_parlays INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Sport configurations (from algorithm SPORT_CONFIGS)
CREATE TABLE IF NOT EXISTS public.sport_configs (
  sport_key VARCHAR(50) PRIMARY KEY,
  sport_title VARCHAR(100) NOT NULL,
  variance DECIMAL(3,1) NOT NULL,
  typical_margin INTEGER NOT NULL,
  settlement_delay_hours INTEGER DEFAULT 6,
  game_duration_minutes INTEGER,
  periods JSONB
);

-- Insert sport configs from v3.1.5
INSERT INTO public.sport_configs VALUES
  ('americanfootball_nfl', 'NFL', 1.5, 7, 6, 60, '["Q1","Q2","Q3","Q4","OT"]'),
  ('basketball_nba', 'NBA', 1.0, 8, 4, 48, '["Q1","Q2","Q3","Q4","OT"]'),
  ('baseball_mlb', 'MLB', 0.7, 3, 8, NULL, '[1,2,3,4,5,6,7,8,9,"Extra"]'),
  ('icehockey_nhl', 'NHL', 0.6, 2, 6, 60, '["P1","P2","P3","OT","SO"]'),
  ('soccer_epl', 'Soccer', 0.5, 1, 6, 90, '["1H","2H","ET","PK"]')
ON CONFLICT (sport_key) DO NOTHING;

-- 3. Games table (from Odds API)
CREATE TABLE IF NOT EXISTS public.games (
  id VARCHAR(255) PRIMARY KEY,
  sport_key VARCHAR(50) NOT NULL REFERENCES public.sport_configs(sport_key),
  commence_time TIMESTAMP WITH TIME ZONE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
  last_odds_update TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 4. Bets table (supports 1-12 leg parlays!)
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id VARCHAR(255) REFERENCES public.games(id),
  sport_key VARCHAR(50) NOT NULL,
  bet_type VARCHAR(20) NOT NULL CHECK (bet_type IN ('moneyline', 'spread', 'total', 'parlay')),
  market_type VARCHAR(10) DEFAULT '2way' CHECK (market_type IN ('2way', '3way')),
  selection VARCHAR(50),
  team VARCHAR(255),
  line DECIMAL(10,2),
  odds DECIMAL(10,2) NOT NULL,
  stake DECIMAL(10,2) NOT NULL CHECK (stake > 0),
  legs INTEGER DEFAULT 1 CHECK (legs >= 1 AND legs <= 12),

  -- BKS v3.1.5 components
  base_score DECIMAL(5,2) CHECK (base_score >= 0 AND base_score <= 100),
  difficulty DECIMAL(4,3) CHECK (difficulty >= 0 AND difficulty <= 1),
  complexity DECIMAL(4,3) CHECK (complexity >= 0 AND complexity <= 1),
  payout DECIMAL(4,3) CHECK (payout >= 0 AND payout <= 1),
  accuracy_clv DECIMAL(4,3) CHECK (accuracy_clv >= 0 AND accuracy_clv <= 1),
  stake_significance DECIMAL(4,3) CHECK (stake_significance >= 0 AND stake_significance <= 1),
  context_novelty DECIMAL(4,3) CHECK (context_novelty >= 0 AND context_novelty <= 1),

  -- BKS results
  bks_provisional DECIMAL(5,1) CHECK (bks_provisional >= 0 AND bks_provisional <= 100),
  bks_final DECIMAL(5,1) CHECK (bks_final >= 0 AND bks_final <= 100),
  m_provisional DECIMAL(4,3) CHECK (m_provisional >= 0.1 AND m_provisional <= 1),
  m_final DECIMAL(4,3) CHECK (m_final >= 0.1 AND m_final <= 1),

  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LIVE', 'SETTLING', 'SETTLED', 'VOID')),
  outcome VARCHAR(10) CHECK (outcome IN ('WIN', 'LOSS', 'PUSH', NULL)),

  placed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  settled_at TIMESTAMP WITH TIME ZONE,

  placement_signature VARCHAR(255),
  settlement_signature VARCHAR(255)
);

-- 5. Parlay legs table (CRITICAL for parlays!)
CREATE TABLE IF NOT EXISTS public.parlay_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id UUID NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL CHECK (leg_number >= 1 AND leg_number <= 12),
  game_id VARCHAR(255) NOT NULL REFERENCES public.games(id),
  bet_type VARCHAR(20) NOT NULL,
  selection VARCHAR(50) NOT NULL,
  team VARCHAR(255),
  line DECIMAL(10,2),
  odds DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  outcome VARCHAR(10),
  cover_margin DECIMAL(10,2),
  UNIQUE(bet_id, leg_number)
);

-- 6. Cached odds table (quota management)
CREATE TABLE IF NOT EXISTS public.cached_odds (
  cache_key VARCHAR(255) PRIMARY KEY,
  sport_key VARCHAR(50) NOT NULL,
  event_id VARCHAR(255),
  odds_data JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  hit_count INTEGER DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_overall_bks ON public.users(overall_bks DESC);
CREATE INDEX IF NOT EXISTS idx_games_sport_commence ON public.games(sport_key, commence_time);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games(status) WHERE status IN ('upcoming', 'live');
CREATE INDEX IF NOT EXISTS idx_bets_user_status ON public.bets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bets_status ON public.bets(status) WHERE status IN ('PENDING', 'LIVE');
CREATE INDEX IF NOT EXISTS idx_bets_placed_at ON public.bets(placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_parlay_legs_bet ON public.parlay_legs(bet_id);
CREATE INDEX IF NOT EXISTS idx_cached_odds_expires ON public.cached_odds(expires_at);
CREATE INDEX IF NOT EXISTS idx_cached_odds_event ON public.cached_odds(event_id);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlay_legs ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Users can only see their own bets
CREATE POLICY "Users can view own bets" ON public.bets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bets" ON public.bets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only see their own parlay legs
CREATE POLICY "Users can view own parlay legs" ON public.parlay_legs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bets
      WHERE bets.id = parlay_legs.bet_id
      AND bets.user_id = auth.uid()
    )
  );

-- Public can see leaderboard data (usernames and BKS only)
CREATE POLICY "Public can view BKS scores" ON public.users
  FOR SELECT USING (true);

-- Games and sport configs are public
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Games are public" ON public.games
  FOR SELECT USING (true);

ALTER TABLE public.sport_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sport configs are public" ON public.sport_configs
  FOR SELECT USING (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
