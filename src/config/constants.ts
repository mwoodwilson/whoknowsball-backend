// src/config/constants.ts

export const SPORT_CONFIGS = {
  'americanfootball_nfl': {
    variance: 1.5,
    game_duration_minutes: 60,
    typical_margin: 7,
    settlement_delay_hours: 6,
    periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT']
  },
  'basketball_nba': {
    variance: 1.0,
    game_duration_minutes: 48,
    typical_margin: 8,
    settlement_delay_hours: 4,
    periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT']
  },
  'baseball_mlb': {
    variance: 0.7,
    game_duration_innings: 9,
    typical_margin: 3,
    settlement_delay_hours: 8,
    periods: [1, 2, 3, 4, 5, 6, 7, 8, 9, 'Extra']
  },
  'icehockey_nhl': {
    variance: 0.6,
    game_duration_minutes: 60,
    typical_margin: 2,
    settlement_delay_hours: 6,
    periods: ['P1', 'P2', 'P3', 'OT', 'SO']
  },
  'soccer_epl': {
    variance: 0.5,
    game_duration_minutes: 90,
    typical_margin: 1,
    settlement_delay_hours: 6,
    periods: ['1H', '2H', 'ET', 'PK']
  }
};

export const BKS_VERSION = '3.1.5';

// Component weights redacted for IP protection
// Contact: matthew.wood.wilson@gmail.com for licensing inquiries
export const COMPONENT_WEIGHTS = {
  difficulty: '[REDACTED]' as unknown as number,
  complexity: '[REDACTED]' as unknown as number,
  payout: '[REDACTED]' as unknown as number,
  accuracy_clv: '[REDACTED]' as unknown as number,
  stake_significance: '[REDACTED]' as unknown as number,
  context_novelty: '[REDACTED]' as unknown as number
};
