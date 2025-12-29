-- Force re-settlement of all bets
-- This will trigger recalculation with the new BKS v3.2.0 formula

-- First, let's see current bet status
SELECT
  status,
  COUNT(*) as count
FROM bets
GROUP BY status;

-- For testing: Update a specific settled bet to trigger re-calculation
-- (The SettlementJob will pick it up and recalculate)
-- Un comment the lines below and replace with actual bet ID:

-- UPDATE bets
-- SET status = 'LIVE'
-- WHERE id = 'your-bet-id-here'
-- AND status = 'SETTLED';
