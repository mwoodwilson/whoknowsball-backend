-- Add API quota tracking table
CREATE TABLE IF NOT EXISTS public.api_quota_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name VARCHAR(50) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  request_count INTEGER DEFAULT 0,
  quota_limit INTEGER NOT NULL,
  reset_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add stake percentiles table for stake significance calculation
CREATE TABLE IF NOT EXISTS public.stake_percentiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport_key VARCHAR(50) NOT NULL,
  percentile_50 DECIMAL(10,2),
  percentile_75 DECIMAL(10,2),
  percentile_90 DECIMAL(10,2),
  percentile_95 DECIMAL(10,2),
  sample_size INTEGER DEFAULT 0,
  last_calculated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, sport_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_quota_api_endpoint ON public.api_quota_tracking(api_name, endpoint);
CREATE INDEX IF NOT EXISTS idx_quota_reset ON public.api_quota_tracking(reset_at);
CREATE INDEX IF NOT EXISTS idx_stake_percentiles_user ON public.stake_percentiles(user_id);
CREATE INDEX IF NOT EXISTS idx_stake_percentiles_sport ON public.stake_percentiles(sport_key);

-- RLS for stake_percentiles
ALTER TABLE public.stake_percentiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stake percentiles" ON public.stake_percentiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stake percentiles" ON public.stake_percentiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stake percentiles" ON public.stake_percentiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at for api_quota_tracking
CREATE TRIGGER update_quota_tracking_updated_at BEFORE UPDATE ON public.api_quota_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
