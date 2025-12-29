-- Fix base_score constraint to allow values > 100
-- The BKS algorithm intentionally allows base scores to exceed 100 for exceptional bets
-- (high-odds parlays, perfect accuracy streaks, etc.)
-- The final BKS is clamped at 100, but we want to preserve the unclamped base for analytics

ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_base_score_check;
ALTER TABLE bets ADD CONSTRAINT bets_base_score_check CHECK (base_score >= 0 AND base_score <= 150);
