-- Migration: Add bks_daily_snapshots table for historical BKS tracking
-- Purpose: Power "BKS Over Time" line chart in MyBKS dashboard
-- Date: 2025-11-19

CREATE TABLE IF NOT EXISTS public.bks_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  daily_bks NUMERIC(5, 2) CHECK (daily_bks >= 0 AND daily_bks <= 100),
  bets_settled_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one snapshot per user per date
  UNIQUE(user_id, snapshot_date)
);

-- Index for efficient queries
CREATE INDEX idx_bks_daily_user_date ON public.bks_daily_snapshots(user_id, snapshot_date DESC);

-- Enable RLS
ALTER TABLE public.bks_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own snapshots
CREATE POLICY "Users can view own daily BKS snapshots"
  ON public.bks_daily_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert/update
CREATE POLICY "Service role can manage daily BKS snapshots"
  ON public.bks_daily_snapshots
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.bks_daily_snapshots IS 'Daily BKS snapshots for historical charts';
COMMENT ON COLUMN public.bks_daily_snapshots.daily_bks IS 'Average BKS of all bets settled on this date';
