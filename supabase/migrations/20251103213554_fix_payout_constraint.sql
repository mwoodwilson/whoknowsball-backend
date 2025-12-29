-- Fix payout constraint to allow values up to 3.0
--
-- WHY: BKS v3.4.0 calculator allows payout component P to range from 0 to 3.0
-- (calculated as P_max = 1.0 + difficulty * 2.0), but the database schema
-- was limiting it to 1.0, causing constraint violations for high-payout bets.
--
-- CHANGE: Update payout column to allow values up to 3.00

-- Step 1: Drop the old constraint
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_payout_check;

-- Step 2: Alter the column type to accommodate values up to 3.00
-- Change from DECIMAL(4,3) to DECIMAL(4,2) since we need up to 3.00
ALTER TABLE bets ALTER COLUMN payout TYPE DECIMAL(4,2);

-- Step 3: Add new constraint allowing values from 0 to 3
ALTER TABLE bets ADD CONSTRAINT bets_payout_check CHECK (payout >= 0 AND payout <= 3);
