// src/services/bks/types.ts

export type Market = 'h2h' | '3way' | 'spreads' | 'totals';
export type Status = 'PENDING' | 'LIVE' | 'SETTLING' | 'SETTLED' | 'VOID';
export type Selection = 'home' | 'away' | 'draw' | 'over' | 'under';

export interface Leg {
  sport_key: string;
  market: Market;
  selection: Selection;
  // ENTRY (at placement)
  odds_american: number; // selected entry price
  line?: number; // for spreads/totals
  bookmaker?: string;
  // NEW: entry-time opponents (needed for devig)
  entry_opposing_odds_american?: number; // required for 2-way (h2h/spreads/totals)
  entry_draw_odds_american?: number; // required for 3-way
  // CLOSING snapshot (strictly pre-commence)
  closing?: {
    odds_american: number; // selected closing price
    opposing_odds_american?: number; // 2-way opposing closing price
    draw_odds_american?: number; // 3-way draw closing price
    line?: number; // closing line for spreads/totals
    ts: number; // epoch seconds < commence_ts
  };
  // SETTLEMENT outcome (for parlay loss BKS calculation)
  outcome?: 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
}

export interface BetData {
  bet_id: string;
  sport_key: string;
  status: Status;
  market: Market;
  selection: Selection;
  // ENTRY (at placement) - single leg
  odds_american: number;
  line?: number;
  // NEW: single-leg entry opponents (for 3-way single bets)
  entry_opposing_odds_american?: number; // required for 2-way single bets
  entry_draw_odds_american?: number; // required for 3-way single bets
  // CLOSING snapshot for single leg
  closing?: {
    odds_american: number;
    opposing_odds_american?: number;
    draw_odds_american?: number;
    line?: number;
    ts: number;
  };
  // BACKWARD COMPATIBILITY: Direct closing odds fields (test data compatibility)
  closing_opposing_odds_american?: number;
  closing_draw_odds_american?: number;
  result?: 'WIN' | 'LOSS' | 'PUSH' | 'VOID'; // Backward compat for final.result
  // Parlay legs
  legs?: Leg[];
  stake: number;
  correlation?: number; // [0,1] SGP correlation
  context?: string; // maps through K_MAP_JSON
  timeRatio?: number; // [0,1] fraction elapsed for LIVE
  score?: { home: number; away: number; total?: number };
  final?: {
    result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
    home: number;
    away: number;
    total?: number;
  };
  stakePercentile?: number; // 0..1 if computed elsewhere
}

export interface BKSComponents {
  D: number; // Difficulty
  C: number; // Complexity
  P: number; // Payout
  A: number; // Accuracy/CLV
  S: number; // Stake Significance
  K: number; // Context
}

export interface BKSResult {
  bks: number; // 1 dp, ≤ 100.0
  status: Status;
  version?: string;
  // INTERNAL ONLY - do not return to mobile client
  base?: number;
  m?: number;
  components?: BKSComponents;
}

// Legacy types for backwards compatibility
export interface BetInput {
  bet_id?: string;
  user_id: string;
  game_id: string;
  sport_key: string;
  bet_type: 'moneyline' | 'spread' | 'total' | 'parlay';
  market_type?: '2way' | '3way';
  selection?: string;
  team?: string;
  line?: number;
  odds: number;
  stake: number;
  legs?: number;
  odds_open?: number;
  odds_close?: number;
  odds_open_opposing?: number;
  odds_close_opposing?: number;
  bookmaker_open?: string;
  bookmaker_close?: string;
  timestamp_open?: Date;
  timestamp_close?: Date;
  commence_time?: Date;
  parlay_legs?: ParlayLeg[];
}

export interface ParlayLeg {
  leg_number: number;
  game_id: string;
  bet_type: string;
  selection: string;
  odds: number;
  outcome?: 'WIN' | 'LOSS' | 'PUSH';
  cover_margin?: number;
}
