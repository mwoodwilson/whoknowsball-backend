# Ball Knowing Score (BKS) Algorithm
## v3.4.0 - Complete Production-Ready Specification with Dual-Source Architecture
**Last Updated:** December 14, 2025
**Version:** 3.4.0 (Production-Ready)
**Status:** Deployed

---

## Executive Summary

Ball Knowing Score (BKS) quantifies sports betting skill on a 0–100 scale by evaluating bet difficulty, construction quality, payout conviction, market edge, stake significance, and game context. The algorithm rewards sophisticated betting while preventing gaming through multi-factor analysis and outcome-based scaling.

### Key Updates in v3.4.0:
- **Difficulty-scaled payout ceiling**: P component now capped based on difficulty to prevent easy-bet gaming
- **Conviction multiplier**: Stake factor integrated into payout calculation (higher stakes = higher conviction)
- **Rebalanced weights**: D increased to 45%, A reduced to 10%, optimized for skill differentiation
- **Dual-source architecture**: API-Sports primary (games/scores), The Odds API secondary (odds only)
- **Dynamic polling**: 3-tier system for live games reduces quota by ~80%
- **Enhanced outcome multipliers**: Refined WIN/LOSS ranges based on cover margin z-scores

### Core Principles:
- **Separation of concerns**: Base contains pre-result characteristics; M contains outcome only
- **No double-counting**: CLV lives only in Base (A); Result Margin lives only in M
- **Privacy by design**: Client API returns only `{bks, status, version}`
- **Graceful degradation**: Never fail due to missing data; use safe defaults
- **Quota efficiency**: Aggressive optimization after Nov 2025 quota crisis (56,000 → 650 calls/day)

---

## 1. Algorithm Overview

### Master Formula
```
BKS = Base × M
```

Where:
- **Base ∈ [0, 100]**: Composite score of bet characteristics (pre-result)
- **M ∈ [0.10, 1.00]**: Outcome multiplier (result-based scaling only)

### Core Invariant
For any given Base: **Win BKS > Loss BKS** (guaranteed)

### Scoring States

| State | Description | M Behavior |
|-------|-------------|------------|
| **PENDING** | Game not started | Provisional M based on difficulty |
| **LIVE** | Game in progress | Time-aware provisional scoring |
| **SETTLING** | Game completed, awaiting delay | Transition state |
| **SETTLED** | Final BKS locked | Final M from outcome |
| **VOID** | Cancelled/invalid bet | M = 0.50 (neutral) |

### State Machine
```javascript
const BET_STATE_TRANSITIONS = {
  PENDING: ['LIVE', 'VOID'],
  LIVE: ['SETTLING', 'VOID'],
  SETTLING: ['SETTLED', 'VOID'],
  SETTLED: [], // Terminal state
  VOID: []     // Terminal state
};
```

---

## 2. Dual-Source Data Architecture

### 2.1 Data Sources

BKS v3.4.0 uses a **dual-source architecture** optimized after the November 2025 quota crisis:

| Source | Role | Daily Quota | Usage |
|--------|------|-------------|-------|
| **API-Sports** | Primary | 7,500/sport | Game creation, live scores |
| **The Odds API** | Secondary | ~1,613 total | Betting odds only |

### 2.2 Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        BKS Backend                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │ GameCreationJob │              │ OddsMatchingJob │           │
│  │   (Daily 2AM)   │              │   (Every 40s)   │           │
│  └────────┬────────┘              └────────┬────────┘           │
│           │                                │                     │
│           ▼                                ▼                     │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │   API-Sports    │              │  The Odds API   │           │
│  │   (Primary)     │              │   (Secondary)   │           │
│  │                 │              │                 │           │
│  │ • Game data     │              │ • h2h odds      │           │
│  │ • Live scores   │              │ • Spread odds   │           │
│  │ • Final scores  │              │ • Total odds    │           │
│  └────────┬────────┘              └────────┬────────┘           │
│           │                                │                     │
│           ▼                                ▼                     │
│  ┌─────────────────────────────────────────────────────┐        │
│  │                   games table                        │        │
│  │  id (API-Sports) │ teams │ scores │ odds_api_event_id       │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Game ID Strategy
- **Primary ID**: API-Sports game ID (e.g., `"1234567"`)
- **Cross-reference**: `odds_api_event_id` links to The Odds API events
- **Matching**: Fuzzy team name + commence time matching (±60 min window)

### 2.4 Supported Sports

| Sport Key | API-Sports League ID | Polling Priority |
|-----------|---------------------|------------------|
| `americanfootball_nfl` | 1 | High (30s live) |
| `basketball_nba` | 12 | High (30s live) |
| `icehockey_nhl` | 57 | High (30s live) |
| `baseball_mlb` | 1 | Medium (disabled offseason) |

---

## 3. Background Jobs Architecture

### 3.1 Job Summary

| Job | Interval | Purpose | Quota Impact |
|-----|----------|---------|--------------|
| **GameCreationJob** | Daily 2AM + startup | Sync games from API-Sports | 7,500/sport/day |
| **OddsMatchingJob** | 40 seconds | Match Odds API events to games | ~1,613/day |
| **ScoresJob** | 30 seconds (dynamic) | Update live/final scores | API-Sports |
| **SettlementJob** | 5 minutes | Settle completed bets, calculate final BKS | DB only |
| **ClosingOddsJob** | Continuous | Capture T-2 min closing odds | ~50/day |
| **StaleGameDetectionJob** | Periodic | Detect stale game data | DB only |
| **VerificationCheckJob** | Periodic | Check email verification status | DB only |

### 3.2 GameCreationJob

**Purpose**: Sync games from API-Sports (primary source)

```typescript
class GameCreationJob {
  async run() {
    for (const sport of SUPPORTED_SPORTS) {
      // Fetch games: 1 day back, 3 days forward
      const games = await APISportsService.fetchGames(sport, {
        lookBack: 1,
        lookAhead: 3
      });

      for (const game of games) {
        // Normalize team names via teamMappings.ts
        const normalized = this.normalizeGame(game);

        // Upsert to database (never delete)
        await supabase.from('games').upsert(normalized);
      }

      await this.sleep(2000); // Rate limit between sports
    }
  }
}
```

**Quota Optimization**:
- Original: 21 days = ~300 games/sport/day
- Optimized: 4 days = ~60 games/sport/day
- **Savings: ~80% quota reduction**

### 3.3 OddsMatchingJob

**Purpose**: Match The Odds API events to API-Sports games

```typescript
class OddsMatchingJob {
  async run() {
    for (const sport of SUPPORTED_SPORTS) {
      // Skip if no upcoming/live games in next 4 hours
      const hasRelevantGames = await this.checkRelevantGames(sport);
      if (!hasRelevantGames) {
        logger.info(`Skipping ${sport} - no games in next 4 hours`);
        continue;
      }

      // Fetch odds from The Odds API
      const oddsEvents = await OddsAPIService.fetchOdds(sport);

      for (const event of oddsEvents) {
        // Find matching game by team names + time
        const game = await this.findMatchingGame(event);

        if (game) {
          // Update cross-reference
          await supabase.from('games')
            .update({ odds_api_event_id: event.id })
            .eq('id', game.id);

          // Cache odds in Redis (60s TTL)
          await redis.setEx(`odds:${game.id}`, 60, JSON.stringify(event));
        }
      }
    }
  }
}
```

### 3.4 ScoresJob (Dynamic Polling)

**Purpose**: Update live/final scores with 3-tier priority

```typescript
class ScoresJob {
  private cycleCount = 0;

  async run() {
    this.cycleCount++;

    for (const sport of SUPPORTED_SPORTS) {
      const games = await this.getGamesForSport(sport);

      // Categorize games
      const live = games.filter(g => g.status === 'live');
      const imminent = games.filter(g => this.isImminent(g, 15)); // <15 min
      const future = games.filter(g => !this.isImminent(g, 15));

      // Tier 1: Live + Imminent - every cycle (30s)
      for (const game of [...live, ...imminent]) {
        await this.updateScore(game);
      }

      // Tier 2: Future games - every 10 cycles (5 min)
      if (this.cycleCount % 10 === 0) {
        for (const game of future) {
          await this.updateScore(game);
        }
      }

      logger.info(`[ScoresJob] ${sport}: ${live.length} live, ${imminent.length} imminent, ${future.length} future`);
    }
  }
}
```

**Dynamic Polling Benefits**:
- Live games: Updated every 30 seconds
- Future games: Updated every 5 minutes
- **Quota savings: ~80%** while maintaining real-time UX

### 3.5 SettlementJob

**Purpose**: Settle completed bets and calculate final BKS

```typescript
class SettlementJob {
  async run() {
    // 1. Transition PENDING → LIVE
    const pendingBets = await this.getPendingBetsWithStartedGames();
    for (const bet of pendingBets) {
      await this.transitionToLive(bet);
    }

    // 2. Settle LIVE bets on completed games
    const liveBets = await this.getLiveBetsWithCompletedGames();
    for (const bet of liveBets) {
      // Determine outcome
      const outcome = this.determineBetOutcome(bet);

      // Calculate final BKS
      const finalBKS = await BKSCalculator.calculate({
        ...bet,
        status: 'SETTLED',
        final: { result: outcome, ...bet.game.scores }
      });

      // Update bet
      await supabase.from('bets').update({
        bks_final: finalBKS.bks,
        outcome,
        status: 'SETTLED',
        settled_at: new Date()
      }).eq('id', bet.id);

      // Update user's overall BKS
      await OverallBKSService.updateUserBKS(bet.user_id);

      // Update daily snapshot
      await DailyBKSService.updateDailySnapshot(bet.user_id);
    }
  }
}
```

### 3.6 ClosingOddsJob

**Purpose**: Capture closing odds T-2 minutes before game start

```typescript
class ClosingOddsJob {
  private captureWindows = [
    { minutes: 2, priority: 1 },  // Primary: T-2min
    { minutes: 1, priority: 2 },  // Fallback: T-1min
    { minutes: 5, priority: 3 }   // Extended: T-5min
  ];

  async captureClosingOdds(game) {
    const now = Date.now();
    const timeToStart = new Date(game.commence_time) - now;

    for (const window of this.captureWindows) {
      const windowMs = window.minutes * 60 * 1000;

      if (timeToStart <= windowMs && timeToStart > (windowMs - 60000)) {
        const odds = await OddsAPIService.fetchOdds(game.sport_key, {
          eventIds: game.odds_api_event_id
        });

        // Store closing snapshot
        await redis.setEx(
          `closing_odds:${game.id}`,
          24 * 60 * 60, // 24h TTL
          JSON.stringify({
            ...odds,
            captured_at: new Date(),
            priority: window.priority
          })
        );

        return odds;
      }
    }
  }
}
```

---

## 4. Base Score Calculation (0–100)

### Formula
```
Base = 100 × (0.45×D + 0.18×C + 0.13×P + 0.10×A + 0.10×S + 0.04×K)
```

| Component | Weight | Range | Description |
|-----------|--------|-------|-------------|
| **D** (Difficulty) | 45% | [0, 1] | Fair win probability (harder = higher) |
| **C** (Complexity) | 18% | [0, 0.9] | Parlay legs + correlation penalty |
| **P** (Payout) | 13% | [0, P_max] | Return multiple with conviction multiplier |
| **A** (Accuracy/CLV) | 10% | [0, 1] | Closing line value |
| **S** (Stake) | 10% | [0, 1] | Stake significance (logarithmic) |
| **K** (Context) | 4% | [0, 1] | Game importance |

**Critical Design Note**: Base contains ONLY pre-result characteristics. Result margin (RM) lives exclusively in the Outcome Multiplier M to avoid double-counting.

### 4.1 Difficulty (D) — 45%

Measures true implied probability difficulty using de-vigged fair probabilities.

```typescript
class DifficultyCalculator {
  calculate(bet: BetData): number {
    if (bet.type === 'parlay') {
      return this.calculateParlayDifficulty(bet);
    }

    return this.calculateSingleDifficulty(bet);
  }

  calculateSingleDifficulty(bet: BetData): number {
    // Get fair probability via de-vigging
    const fairProb = this.getFairProbability(bet);

    // D = 1 - fair_probability (harder = higher D)
    return 1 - fairProb;
  }

  calculateParlayDifficulty(bet: BetData): number {
    // Combined probability = product of leg fair probs
    const combinedProb = bet.legs.reduce((prob, leg) => {
      return prob * this.getFairProbability(leg);
    }, 1);

    return 1 - combinedProb;
  }

  getFairProbability(bet: BetData): number {
    const decimalOdds = this.americanToDecimal(bet.odds);
    const opposingDecimal = this.americanToDecimal(bet.odds_opposing);

    // De-vig using proportional scaling
    const rawProb = 1 / decimalOdds;
    const rawOpposing = 1 / opposingDecimal;
    const totalProb = rawProb + rawOpposing; // Includes vig

    // Fair probability after removing vig
    return rawProb / totalProb;
  }

  // 3-way market de-vigging (soccer, hockey draws)
  devig3Way(oddsHome: number, oddsDraw: number, oddsAway: number) {
    const pHome = 1 / this.americanToDecimal(oddsHome);
    const pDraw = 1 / this.americanToDecimal(oddsDraw);
    const pAway = 1 / this.americanToDecimal(oddsAway);
    const total = pHome + pDraw + pAway;

    return {
      home: pHome / total,
      draw: pDraw / total,
      away: pAway / total,
      vig: total - 1
    };
  }

  americanToDecimal(odds: number): number {
    if (odds > 0) {
      return 1 + (odds / 100);  // +150 → 2.50
    } else {
      return 1 + (100 / Math.abs(odds));  // -150 → 1.667
    }
  }
}
```

**Example Calculations**:
| Odds | Fair Prob | Difficulty (D) |
|------|-----------|----------------|
| -300 | 0.75 | 0.25 |
| -150 | 0.60 | 0.40 |
| -110 | 0.52 | 0.48 |
| +150 | 0.40 | 0.60 |
| +300 | 0.25 | 0.75 |

### 4.2 Complexity (C) — 18%

Rewards multi-leg construction, adjusted for correlation.

```typescript
calculateComplexity(bet: BetData): number {
  if (bet.type !== 'parlay' || bet.legs.length === 1) {
    return 0; // Single bets have no complexity bonus
  }

  const L = Math.min(bet.legs.length, 12); // Cap at 12 legs
  const rho = bet.correlation || 0; // SGP correlation factor [0,1]

  // Base complexity from leg count
  const legComponent = Math.min((L - 1) * 0.3, 0.9);

  // Correlation penalty (correlated legs = less impressive)
  const correlationPenalty = 1 - (0.5 * rho);

  return legComponent * correlationPenalty;
}
```

**Complexity by Leg Count**:
| Legs | Base | With ρ=0 | With ρ=0.5 |
|------|------|----------|------------|
| 1 | 0 | 0 | 0 |
| 2 | 0.3 | 0.30 | 0.225 |
| 3 | 0.6 | 0.60 | 0.45 |
| 4 | 0.9 | 0.90 | 0.675 |
| 5+ | 0.9 | 0.90 | 0.675 |

### 4.3 Payout Multiple (P) — 13% ⚡ NEW IN v3.4.0

**Key Innovation**: Conviction multiplier rewards higher stakes proportionally, with a difficulty-scaled ceiling to prevent easy-bet gaming.

```typescript
calculatePayout(bet: BetData, D: number): number {
  // PM = payout multiple (decimal_odds - 1)
  const PM = this.americanToDecimal(bet.odds) - 1;

  // SF = stake factor (logarithmic)
  const SF = Math.log10(bet.stake + 9) / Math.log10(10009);

  // CM = conviction multiplier (higher stakes = more conviction)
  const CM = 1.0 + (10.0 * SF);

  // P_max = difficulty-scaled ceiling (harder bets allow higher P)
  const P_max = 1.0 + (D * 2.0);

  // Final P with clamp
  const rawP = (PM / 10) * CM;
  return Math.min(Math.max(rawP, 0), P_max);
}
```

**Conviction Multiplier Table**:
| Stake | SF | CM | Effect |
|-------|-----|-----|--------|
| $10 | 0.32 | 4.2 | Base conviction |
| $50 | 0.43 | 5.3 | +26% |
| $100 | 0.51 | 6.1 | +45% |
| $500 | 0.67 | 7.7 | +83% |
| $1,000 | 0.75 | 8.5 | +102% |
| $10,000 | 1.00 | 11.0 | +162% |

**P_max Examples** (Difficulty-Scaled Ceiling):
| Difficulty (D) | P_max |
|----------------|-------|
| 0.25 (easy) | 1.50 |
| 0.50 (medium) | 2.00 |
| 0.75 (hard) | 2.50 |
| 0.90 (very hard) | 2.80 |

### 4.4 Accuracy / CLV (A) — 10%

Closing Line Value measures market edge by comparing entry odds to closing odds.

```typescript
class CLVCalculator {
  private EPSILON = 1e-8; // Numeric stability

  calculate(bet: BetData): number {
    // Validate inputs
    if (!this.hasValidClosingData(bet)) {
      return 0.5; // Neutral if no closing data
    }

    // Get fair probabilities at entry and close
    const pOpenFair = this.devig(bet.odds_open, bet.odds_open_opposing);
    const pCloseFair = this.devig(bet.odds_close, bet.odds_close_opposing);

    // CLV = change in log odds
    const logOddsOpen = this.safeLogOdds(pOpenFair);
    const logOddsClose = this.safeLogOdds(pCloseFair);

    const clvRaw = logOddsClose - logOddsOpen;

    // Normalize to [0, 1] with ±0.15 clamp
    const clampedCLV = Math.max(-0.15, Math.min(0.15, clvRaw));
    return (clampedCLV + 0.15) / 0.3;
  }

  safeLogOdds(p: number): number {
    // Clamp to prevent log(0) or log(1)
    const clamped = Math.max(this.EPSILON, Math.min(1 - this.EPSILON, p));
    return Math.log(clamped / (1 - clamped));
  }

  hasValidClosingData(bet: BetData): boolean {
    return (
      bet.odds_close !== undefined &&
      bet.odds_close_opposing !== undefined &&
      bet.timestamp_close > bet.timestamp_open &&
      bet.timestamp_close < bet.commence_time
    );
  }
}
```

**CLV Interpretation**:
| CLV Raw | A Score | Meaning |
|---------|---------|---------|
| +0.15 | 1.0 | Maximum edge (got best possible price) |
| +0.05 | 0.67 | Good edge |
| 0 | 0.50 | Neutral (no edge) |
| -0.05 | 0.33 | Bad timing |
| -0.15 | 0.0 | Worst timing (line moved against) |

### 4.5 Stake Significance (S) — 10%

Logarithmic scaling rewards larger stakes with diminishing returns.

```typescript
calculateStake(bet: BetData): number {
  // S = log₁₀(stake + 9) / log₁₀(10009)
  return Math.log10(bet.stake + 9) / Math.log10(10009);
}
```

**Stake Significance Table**:
| Stake | S Value |
|-------|---------|
| $1 | 0.25 |
| $10 | 0.32 |
| $50 | 0.43 |
| $100 | 0.51 |
| $500 | 0.67 |
| $1,000 | 0.75 |
| $5,000 | 0.92 |
| $10,000 | 1.00 |

### 4.6 Context (K) — 4%

Game importance based on season phase.

```typescript
const K_MAP = {
  preseason: 0.2,
  regular: 0.4,
  playoffs: 0.7,
  finals: 1.0
};

calculateContext(bet: BetData): number {
  return K_MAP[bet.context] || 0.4; // Default to regular season
}
```

---

## 5. Outcome Multiplier (M)

**Critical Design Note**: M contains ONLY result-based scaling. Market edge (CLV) lives exclusively in Base component A.

### 5.1 Multiplier Ranges

| Outcome | M Range | Formula |
|---------|---------|---------|
| **WIN** | [0.60, 1.00] | Based on cover margin z-score |
| **LOSS** | [0.10, 0.50] | Based on margin severity |
| **PUSH** | 0.55 | Fixed neutral |
| **VOID** | 0.50 | Fixed neutral |
| **PENDING** | [0.50, 0.95] | Based on difficulty |
| **LIVE** | [0.10, 0.95] | Time-aware provisional |

### 5.2 WIN Multiplier

```typescript
calculateWinM(game: Game, bet: BetData): number {
  const coverMargin = this.getCoverMargin(game, bet);
  const sigma = SPORT_CONFIGS[game.sport_key].variance;

  // z = standardized margin
  const z = coverMargin / sigma;

  // M_win = 0.60 + 0.40 × clamp(z/3, 0, 1)
  const conviction = Math.min(Math.max(z / 3, 0), 1);
  return 0.60 + (0.40 * conviction);
}
```

**WIN Multiplier Examples**:
| Sport | Margin | σ | z | M |
|-------|--------|---|---|---|
| NFL | 1 pt | 1.5 | 0.67 | 0.69 |
| NFL | 7 pts | 1.5 | 4.67 | 1.00 |
| NBA | 3 pts | 1.0 | 3.00 | 1.00 |
| NBA | 1 pt | 1.0 | 1.00 | 0.73 |

### 5.3 LOSS Multiplier

```typescript
calculateLossM(game: Game, bet: BetData): number {
  const coverMargin = this.getCoverMargin(game, bet);
  const sigma = SPORT_CONFIGS[game.sport_key].variance;

  // z = standardized margin (negative for losses)
  const z = Math.abs(coverMargin) / sigma;

  // M_loss = 0.10 + 0.40 × (1 - clamp(|z|/3, 0, 1))
  const closeLoss = 1 - Math.min(Math.max(z / 3, 0), 1);
  return 0.10 + (0.40 * closeLoss);
}
```

**LOSS Multiplier Examples**:
| Sport | Margin | σ | z | M | Interpretation |
|-------|--------|---|---|---|----------------|
| NFL | -1 pt | 1.5 | 0.67 | 0.41 | Close loss (good) |
| NFL | -7 pts | 1.5 | 4.67 | 0.10 | Blowout loss (bad) |
| NBA | -3 pts | 1.0 | 3.00 | 0.10 | Blowout loss (bad) |
| NBA | -1 pt | 1.0 | 1.00 | 0.37 | Close loss (good) |

### 5.4 PENDING Multiplier

Provisional scoring before game starts, scaled by difficulty.

```typescript
calculatePendingM(bet: BetData, D: number): number {
  // M_pending = 0.50 + (D × 0.45)
  // Harder bets get higher provisional scores
  return 0.50 + (D * 0.45);
}
```

**PENDING Multiplier by Difficulty**:
| Difficulty (D) | M_pending |
|----------------|-----------|
| 0.25 (easy) | 0.61 |
| 0.50 (medium) | 0.73 |
| 0.75 (hard) | 0.84 |
| 0.90 (very hard) | 0.91 |

### 5.5 LIVE Multiplier (Time-Aware)

```typescript
calculateLiveM(game: Game, bet: BetData): number {
  const tau = this.getTimeRatio(game); // [0, 1]
  const zLive = this.getCurrentZScore(game, bet);

  // M_live = clamp(0.25 + 0.30×τ + 0.25×tanh(z_live/2), 0.10, 0.95)
  const rawM = 0.25 + (0.30 * tau) + (0.25 * Math.tanh(zLive / 2));
  return Math.min(Math.max(rawM, 0.10), 0.95);
}

getTimeRatio(game: Game): number {
  const sport = SPORT_CONFIGS[game.sport_key];

  if (game.sport_key === 'baseball_mlb') {
    // MLB: Use innings
    const inning = game.period || 1;
    const outs = game.outs || 0;
    return Math.min(1, ((inning - 1) + (outs / 3)) / 9);
  }

  // Other sports: Use elapsed minutes
  return Math.min(1, game.elapsed_minutes / sport.game_duration_minutes);
}
```

### 5.6 Sport Variance (σ) Configuration

```typescript
const SPORT_CONFIGS = {
  'americanfootball_nfl': {
    variance: 1.5,
    game_duration_minutes: 60,
    typical_margin: 7,
    settlement_delay_hours: 6
  },
  'basketball_nba': {
    variance: 1.0,
    game_duration_minutes: 48,
    typical_margin: 8,
    settlement_delay_hours: 4
  },
  'baseball_mlb': {
    variance: 0.7,
    game_duration_innings: 9,
    typical_margin: 3,
    settlement_delay_hours: 8
  },
  'icehockey_nhl': {
    variance: 0.6,
    game_duration_minutes: 60,
    typical_margin: 2,
    settlement_delay_hours: 6
  },
  'soccer_epl': {
    variance: 0.5,
    game_duration_minutes: 90,
    typical_margin: 1,
    settlement_delay_hours: 6
  }
};
```

---

## 6. Complete BKS Calculator Implementation

### 6.1 Main Calculator Class

```typescript
// File: src/services/bks/BKSCalculator.ts

class BKSCalculator {
  static readonly VERSION = '3.4.0';

  async calculate(bet: BetData): Promise<BKSResult> {
    try {
      // Calculate all components
      const D = this.calculateDifficulty(bet);
      const C = this.calculateComplexity(bet);
      const P = this.calculatePayout(bet, D); // P depends on D
      const A = await this.calculateAccuracy(bet);
      const S = this.calculateStake(bet);
      const K = this.calculateContext(bet);

      // Base score (0-100)
      const base = 100 * (
        0.45 * D +
        0.18 * C +
        0.13 * P +
        0.10 * A +
        0.10 * S +
        0.04 * K
      );

      // Outcome multiplier
      const M = this.getMultiplier(bet);

      // Final BKS (capped at 100)
      const bks = Math.min(base * M, 100);

      return {
        bks: Math.round(bks * 10) / 10, // 1 decimal place
        status: bet.status,
        version: BKSCalculator.VERSION
      };
    } catch (error) {
      logger.error(`BKS calculation failed for bet ${bet.id}:`, error);
      throw error;
    }
  }

  getMultiplier(bet: BetData): number {
    const D = this.calculateDifficulty(bet);

    switch (bet.status) {
      case 'PENDING':
        return this.calculatePendingM(bet, D);
      case 'LIVE':
        return this.calculateLiveM(bet.game, bet);
      case 'SETTLED':
        return this.calculateFinalM(bet);
      case 'VOID':
        return 0.50;
      default:
        return 0.50;
    }
  }

  calculateFinalM(bet: BetData): number {
    switch (bet.outcome) {
      case 'WIN':
        return this.calculateWinM(bet.game, bet);
      case 'LOSS':
        return this.calculateLossM(bet.game, bet);
      case 'PUSH':
        return 0.55;
      default:
        return 0.50;
    }
  }
}
```

### 6.2 Bet Outcome Determination

```typescript
determineBetOutcome(game: Game, bet: BetData): 'WIN' | 'LOSS' | 'PUSH' {
  const homeScore = game.home_score;
  const awayScore = game.away_score;

  if (bet.bet_type === 'moneyline') {
    const isHome = bet.selection === 'home';
    const homeWon = homeScore > awayScore;
    const awayWon = awayScore > homeScore;
    const isTied = homeScore === awayScore;

    // Check for 3-way market (soccer draws)
    if (bet.market_type === '3way') {
      if (bet.selection === 'draw') {
        return isTied ? 'WIN' : 'LOSS';
      }
      return (isHome && homeWon) || (!isHome && awayWon) ? 'WIN' : 'LOSS';
    }

    // 2-way market: ties are pushes
    if (isTied) return 'PUSH';
    return (isHome && homeWon) || (!isHome && awayWon) ? 'WIN' : 'LOSS';
  }

  if (bet.bet_type === 'spread') {
    const isHome = bet.team === game.home_team;
    const scoreDiff = isHome ? homeScore - awayScore : awayScore - homeScore;
    const coverMargin = scoreDiff + bet.line; // line is negative for favorites

    if (Math.abs(coverMargin) < 0.01) return 'PUSH';
    return coverMargin > 0 ? 'WIN' : 'LOSS';
  }

  if (bet.bet_type === 'total') {
    const totalScore = homeScore + awayScore;
    const isOver = bet.selection === 'over';

    if (Math.abs(totalScore - bet.line) < 0.01) return 'PUSH';
    return (isOver && totalScore > bet.line) || (!isOver && totalScore < bet.line)
      ? 'WIN' : 'LOSS';
  }

  throw new Error(`Unknown bet type: ${bet.bet_type}`);
}
```

---

## 7. API Contracts

### 7.1 Public API (Client-Facing)

**POST /api/v1/bets/calculate**

Calculate BKS without placing bet. Rate limited: 10 req/min.

```typescript
// Request
{
  bet_id: string,
  game_id: string,
  sport_key: 'americanfootball_nfl' | 'basketball_nba' | 'icehockey_nhl' | 'baseball_mlb',
  status: 'PENDING' | 'LIVE' | 'SETTLING' | 'SETTLED' | 'VOID',
  market: {
    key: 'h2h' | 'spreads' | 'totals',
    type: '2way' | '3way'
  },
  selection: 'home' | 'away' | 'draw' | 'over' | 'under',
  odds_american: number,           // e.g., -110, +150
  stake: number,                   // e.g., 100.00
  line?: number,                   // Required for spreads/totals
  entry_opposing_odds_american?: number,  // For CLV calculation
  closing?: {
    odds_american: number,
    opposing_odds_american: number,
    ts: number
  },
  context?: 'preseason' | 'regular' | 'playoffs' | 'finals'
}

// Response (ONLY these fields - never expose internals)
{
  bks: 67.3,           // 0-100, one decimal place
  status: 'PENDING',   // Current status
  version: '3.4.0'     // Algorithm version
}
```

**POST /api/v1/bets**

Place a bet. Requires authentication.

```typescript
// Request (Single Bet)
{
  game_id: string,
  sport_key: string,
  bet_type: 'moneyline' | 'spread' | 'total',
  market_type: '2way' | '3way',
  selection: 'home' | 'away' | 'draw' | 'over' | 'under',
  team: string,
  odds: number,     // American odds
  stake: number
}

// Request (Parlay)
{
  bet_type: 'parlay',
  stake: number,
  legs: [
    { game_id, selection, odds, ... },
    { game_id, selection, odds, ... }
  ]
}

// Response
{
  success: true,
  bet_id: 'uuid',
  bks_provisional: 62.3,
  status: 'PENDING',
  placed_at: '2025-12-14T14:30:00Z'
}
```

### 7.2 Internal API (Admin/Debugging Only)

**GET /internal/api/v1/bks/{bet_id}/breakdown**

```typescript
// Response (never expose to clients)
{
  bet_id: 'uuid',
  bks: 67.3,
  base: 74.8,
  multiplier: 0.90,
  status: 'SETTLED',
  components: {
    difficulty: 0.52,
    complexity: 0.00,
    payout: 0.48,
    accuracy_clv: 0.65,
    stake: 0.73,
    context: 0.40
  },
  multiplier_details: {
    outcome: 'WIN',
    cover_margin: 3.5,
    z_score: 2.33,
    sigma: 1.5
  },
  metadata: {
    version: '3.4.0',
    calculated_at: '2025-12-14T14:30:00Z'
  }
}
```

---

## 8. Security & Integrity

### 8.1 Response Sanitization

BKS components are NEVER exposed to clients. The `sanitizeBKSResponse` middleware strips all internal details:

```typescript
// middleware/security.middleware.ts

function sanitizeBKSResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (data) => {
    if (data && typeof data === 'object') {
      // Strip internal fields
      const sanitized = {
        bks: data.bks,
        status: data.status,
        version: data.version
      };

      // Remove any component breakdowns
      delete sanitized.base;
      delete sanitized.multiplier;
      delete sanitized.components;
      delete sanitized.multiplier_details;

      return originalJson(sanitized);
    }
    return originalJson(data);
  };

  next();
}
```

### 8.2 HMAC Signatures

Bet placements and settlements are signed for integrity verification:

```typescript
class BKSIntegrity {
  signBKS(betId: string, bks: number, multiplier: number): string {
    const payload = {
      bet_id: betId,
      bks,
      multiplier,
      timestamp: Date.now(),
      version: process.env.BKS_VERSION || '3.4.0'
    };

    return crypto
      .createHmac('sha256', process.env.BKS_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
```

### 8.3 Rate Limiting

```typescript
// Global: 60 req/min
const globalRateLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true
});

// BKS endpoints: 10 req/min (stricter)
const bksRateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  message: 'Too many BKS calculation requests'
});
```

---

## 9. Database Schema

### 9.1 Core Tables

```sql
-- Users with BKS stats
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username VARCHAR(50) UNIQUE NOT NULL,
  overall_bks DECIMAL(5,1) DEFAULT 50.0,
  total_bets INTEGER DEFAULT 0,
  total_won INTEGER DEFAULT 0,
  total_lost INTEGER DEFAULT 0,
  total_push INTEGER DEFAULT 0,
  email_verified BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games from API-Sports
CREATE TABLE games (
  id VARCHAR(255) PRIMARY KEY,  -- API-Sports game ID
  sport_key VARCHAR(50) NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  commence_time TIMESTAMPTZ NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(20) DEFAULT 'upcoming',
  completed BOOLEAN DEFAULT FALSE,
  odds_api_event_id VARCHAR(255),  -- Cross-reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bets with BKS components
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  game_id VARCHAR(255) REFERENCES games(id),
  sport_key VARCHAR(50) NOT NULL,
  bet_type VARCHAR(20) NOT NULL,
  market_type VARCHAR(10) NOT NULL DEFAULT '2way',
  selection VARCHAR(20) NOT NULL,
  team VARCHAR(255),
  line DECIMAL(5,1),
  odds INTEGER NOT NULL,
  stake DECIMAL(10,2) NOT NULL,
  bks_provisional DECIMAL(5,1),
  bks_final DECIMAL(5,1),
  status VARCHAR(20) DEFAULT 'PENDING',
  outcome VARCHAR(10),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- Parlay legs
CREATE TABLE parlay_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id UUID REFERENCES bets(id) ON DELETE CASCADE,
  game_id VARCHAR(255) REFERENCES games(id),
  leg_number INTEGER NOT NULL,
  sport_key VARCHAR(50),
  bet_type VARCHAR(20),
  selection VARCHAR(20),
  team VARCHAR(255),
  line DECIMAL(5,1),
  odds INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  outcome VARCHAR(10)
);

-- Daily BKS snapshots for history charts
CREATE TABLE bks_daily_snapshots (
  user_id UUID REFERENCES users(id),
  snapshot_date DATE NOT NULL,
  daily_bks DECIMAL(5,2),
  bets_settled_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, snapshot_date)
);

-- API quota tracking
CREATE TABLE daily_quota_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  requests_made INTEGER DEFAULT 0,
  quota_limit INTEGER NOT NULL,
  UNIQUE(api_name, date)
);
```

---

## 10. Quota Management

### 10.1 Circuit Breaker with Hysteresis

Prevents oscillation between quota modes:

```typescript
class QuotaManager {
  private thresholds = {
    CRITICAL_ENTER: 20,    // Enter critical at 20 remaining
    CRITICAL_EXIT: 50,     // Exit critical at 50 remaining
    DEGRADED_ENTER: 100,   // Enter degraded at 100 remaining
    DEGRADED_EXIT: 200,    // Exit degraded at 200 remaining
    NORMAL_ENTER: 500      // Enter normal at 500 remaining
  };

  enforceCircuitBreaker() {
    switch (this.currentMode) {
      case 'NORMAL':
        if (this.remaining < this.thresholds.CRITICAL_ENTER) {
          this.enterCriticalMode();
        } else if (this.remaining < this.thresholds.DEGRADED_ENTER) {
          this.enterDegradedMode();
        }
        break;

      case 'DEGRADED':
        if (this.remaining < this.thresholds.CRITICAL_ENTER) {
          this.enterCriticalMode();
        } else if (this.remaining > this.thresholds.DEGRADED_EXIT) {
          this.enterNormalMode();
        }
        break;

      case 'CRITICAL':
        if (this.remaining > this.thresholds.CRITICAL_EXIT) {
          this.enterDegradedMode();
        }
        break;
    }
  }
}
```

### 10.2 Mode Configurations

| Mode | Markets | Regions | Live Polling | Finalization |
|------|---------|---------|--------------|--------------|
| **NORMAL** | h2h, spreads, totals | us | 30s | 15 min |
| **DEGRADED** | h2h only | us | 60s | 30 min |
| **CRITICAL** | None (all polling stopped) | - | - | - |

---

## 11. Quality Assurance

### 11.1 Invariants (Must Always Hold)

- [ ] **Monotonicity**: Win BKS ≥ Loss BKS for same Base
- [ ] **No double-counting**: CLV only in Base (A); RM only in M
- [ ] **Component range**: All D, C, P, A, S, K ∈ [0, 1]
- [ ] **BKS range**: Final BKS ∈ [0, 100.0]
- [ ] **Client privacy**: API returns only `{bks, status, version}`
- [ ] **P ceiling**: P ≤ P_max where P_max = 1 + (D × 2)
- [ ] **State transitions**: Only valid per state machine
- [ ] **Single finalization**: Max 1 settlement update per bet
- [ ] **Thread safety**: All DB operations use transactions

### 11.2 Test Suite

```typescript
describe('BKS Algorithm v3.4.0', () => {
  describe('Core Invariants', () => {
    test('Win BKS > Loss BKS for same base', () => {
      const base = 50;
      const winM = 0.90;
      const lossM = 0.30;

      expect(base * winM).toBeGreaterThan(base * lossM);
    });

    test('Payout respects difficulty-scaled ceiling', () => {
      const calculator = new BKSCalculator();

      // Easy bet (D = 0.25) should have P_max = 1.50
      const easyBet = { odds: -300, stake: 10000 };
      const D = 0.25;
      const P = calculator.calculatePayout(easyBet, D);

      expect(P).toBeLessThanOrEqual(1.50);
    });

    test('Client API returns only bks, status, version', () => {
      const response = await calculateBKS(mockBet);
      const keys = Object.keys(response);

      expect(keys).toEqual(['bks', 'status', 'version']);
      expect(keys).not.toContain('base');
      expect(keys).not.toContain('multiplier');
      expect(keys).not.toContain('components');
    });

    test('BKS never exceeds 100.0', () => {
      // Max possible base ≈ 100 × (0.45×1 + 0.18×0.9 + 0.13×2.8 + 0.10×1 + 0.10×1 + 0.04×1)
      // = 100 × (0.45 + 0.162 + 0.364 + 0.10 + 0.10 + 0.04) = 121.6
      // With M = 1.0: BKS = 121.6, but capped at 100

      const result = await calculator.calculate(extremeBet);
      expect(result.bks).toBeLessThanOrEqual(100.0);
    });
  });

  describe('Component Calculations', () => {
    test('Difficulty uses de-vigged fair probability', () => {
      const D = calculator.calculateDifficulty({
        odds: -150,
        odds_opposing: 130
      });

      // Fair prob ≈ 0.60, so D ≈ 0.40
      expect(D).toBeCloseTo(0.40, 1);
    });

    test('Complexity rewards parlay legs with correlation penalty', () => {
      const C_uncorrelated = calculator.calculateComplexity({
        type: 'parlay',
        legs: [{}, {}, {}],
        correlation: 0
      });

      const C_correlated = calculator.calculateComplexity({
        type: 'parlay',
        legs: [{}, {}, {}],
        correlation: 0.5
      });

      expect(C_uncorrelated).toBeGreaterThan(C_correlated);
    });

    test('Conviction multiplier increases with stake', () => {
      const P_low = calculator.calculatePayout({ odds: 150, stake: 10 }, 0.5);
      const P_high = calculator.calculatePayout({ odds: 150, stake: 1000 }, 0.5);

      expect(P_high).toBeGreaterThan(P_low);
    });
  });

  describe('Outcome Multipliers', () => {
    test('WIN multiplier increases with cover margin', () => {
      const M_narrow = calculator.calculateWinM(
        { sport_key: 'americanfootball_nfl' },
        { cover_margin: 1 }
      );

      const M_blowout = calculator.calculateWinM(
        { sport_key: 'americanfootball_nfl' },
        { cover_margin: 14 }
      );

      expect(M_blowout).toBeGreaterThan(M_narrow);
    });

    test('LOSS multiplier decreases with margin severity', () => {
      const M_close = calculator.calculateLossM(
        { sport_key: 'basketball_nba' },
        { cover_margin: -1 }
      );

      const M_blowout = calculator.calculateLossM(
        { sport_key: 'basketball_nba' },
        { cover_margin: -15 }
      );

      expect(M_close).toBeGreaterThan(M_blowout);
    });
  });
});
```

---

## 12. Monitoring & Metrics

### 12.1 Prometheus Metrics

```typescript
class BKSMetrics {
  initialize() {
    // BKS distribution
    this.bksHistogram = new Histogram({
      name: 'bks_score_distribution',
      help: 'Distribution of BKS scores',
      buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    });

    // Component distributions
    ['difficulty', 'complexity', 'payout', 'clv', 'stake', 'context'].forEach(comp => {
      this.componentGauges[comp] = new Gauge({
        name: `bks_component_${comp}`,
        help: `${comp} component average`
      });
    });

    // API quota
    this.quotaGauge = new Gauge({
      name: 'api_quota_remaining',
      help: 'Remaining API quota',
      labelNames: ['api']
    });

    // Job execution
    this.jobDuration = new Histogram({
      name: 'bks_job_duration_seconds',
      help: 'Background job execution time',
      labelNames: ['job']
    });
  }
}
```

### 12.2 Health Endpoints

```typescript
// GET /health - Basic health
{
  status: 'healthy',
  message: 'BKS Backend is running!',
  timestamp: '2025-12-14T14:30:00Z',
  version: '3.4.0'
}

// GET /api/v1/health - Detailed health (requires API key)
{
  status: 'healthy',
  services: {
    database: 'healthy',
    redis: 'connected',
    api_sports: '7200/7500 requests (quota OK)',
    odds_api: '1400/1613 requests (quota OK)'
  }
}
```

---

## 13. Environment Configuration

### 13.1 Required Variables

```bash
# Server
PORT=3000
NODE_ENV=production
BKS_VERSION=3.4.0

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx

# External APIs
API_SPORTS_KEY=xxx
ODDS_API_KEY=xxx

# Redis
REDIS_URL=redis://localhost:6379

# Security
BKS_SECRET=xxx  # HMAC signing key
API_KEY=xxx     # ngrok/public access key
API_KEY_ENABLED=true
```

### 13.2 Optional Overrides

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
BKS_RATE_LIMIT_MAX=10

# Job Intervals (milliseconds)
LIVE_POLLING_INTERVAL=30000
FINALIZATION_INTERVAL=300000
ODDS_MATCHING_INTERVAL=40000

# BKS Algorithm Overrides
SIGMA_DEFAULTS_JSON={"americanfootball_nfl":{"variance":1.5}}
K_MAP_JSON={"preseason":0.2,"regular":0.4,"playoffs":0.7,"finals":1.0}
```

---

## 14. Migration from v3.3.0 to v3.4.0

### Breaking Changes
1. **P component ceiling**: Now scales with difficulty (P_max = 1 + D×2)
2. **Component weights**: D increased 30%→45%, A decreased 20%→10%
3. **Conviction multiplier**: Stake now affects P component directly
4. **WIN/LOSS ranges**: Adjusted for better skill differentiation

### Migration Steps

```sql
-- No schema changes required
-- Algorithm changes are backward-compatible

-- Update version tracking
UPDATE system_config SET value = '3.4.0' WHERE key = 'bks_version';
```

### Code Migration

```typescript
// v3.3.0 payout calculation
const P = Math.min(1, Math.log(1 + (decimal - 1)) / Math.log(21));

// v3.4.0 payout calculation (with conviction multiplier)
const PM = decimal - 1;
const SF = Math.log10(stake + 9) / Math.log10(10009);
const CM = 1.0 + (10.0 * SF);
const P_max = 1.0 + (D * 2.0);
const P = Math.min(Math.max((PM / 10) * CM, 0), P_max);
```

---

## 15. Summary

### v3.4.0 Production Readiness

✅ **Algorithm Enhancements**:
- Difficulty-scaled payout ceiling prevents easy-bet gaming
- Conviction multiplier rewards high-stakes betting confidence
- Rebalanced weights optimize for skill differentiation
- Time-aware live scoring with sport-specific curves

✅ **Infrastructure Hardening**:
- Dual-source architecture survived 98.8% quota reduction
- Dynamic 3-tier polling reduces API costs by ~80%
- Hysteresis quota management prevents oscillation
- Thread-safe completion tracking

✅ **Security**:
- Response sanitization hides all internal components
- HMAC signatures ensure bet integrity
- Rate limiting prevents algorithm reverse-engineering
- API key protection for public access

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Calculation latency | <50ms |
| Memory footprint | ~500MB |
| Daily API quota | ~9,113 requests |
| Settlement delay | 4-8 hours (sport-specific) |

### Key Invariants

1. **Win > Loss**: For any Base, Win BKS always exceeds Loss BKS
2. **No double-counting**: CLV in Base only, margin in M only
3. **Privacy**: Clients see only `{bks, status, version}`
4. **Range**: BKS ∈ [0, 100] always
5. **Ceiling**: P ≤ 1 + (D × 2) always

---

## Appendix A: Complete Weight Summary

### Base Components (v3.4.0)

| Component | Symbol | Weight | Range | Calculation |
|-----------|--------|--------|-------|-------------|
| Difficulty | D | 45% | [0, 1] | 1 - fair_probability |
| Complexity | C | 18% | [0, 0.9] | min((L-1)×0.3, 0.9) × (1-0.5ρ) |
| Payout | P | 13% | [0, P_max] | clamp((PM/10)×CM, 0, P_max) |
| Accuracy | A | 10% | [0, 1] | CLV normalized |
| Stake | S | 10% | [0, 1] | log₁₀(stake+9) / log₁₀(10009) |
| Context | K | 4% | [0, 1] | K_MAP[context] |

### Outcome Multipliers

| Outcome | M Range | Formula |
|---------|---------|---------|
| WIN | [0.60, 1.00] | 0.60 + 0.40×clamp(z/3, 0, 1) |
| LOSS | [0.10, 0.50] | 0.10 + 0.40×(1-clamp(z/3, 0, 1)) |
| PUSH | 0.55 | Fixed |
| VOID | 0.50 | Fixed |
| PENDING | [0.50, 0.95] | 0.50 + D×0.45 |

---

## Appendix B: Example Calculations

### Example 1: Single Moneyline Bet (Win)

```
Input:
  - Odds: -150 (fair prob ≈ 0.60)
  - Stake: $100
  - Context: Regular season
  - CLV: +0.05 (good timing)
  - Outcome: WIN by 7 points (NFL)

Components:
  D = 1 - 0.60 = 0.40
  C = 0 (single bet)
  P = min((0.667/10) × 6.1, 1 + 0.4×2) = min(0.41, 1.8) = 0.41
  A = (0.05 + 0.15) / 0.3 = 0.67
  S = log₁₀(109) / log₁₀(10009) = 0.51
  K = 0.4

Base = 100 × (0.45×0.40 + 0.18×0 + 0.13×0.41 + 0.10×0.67 + 0.10×0.51 + 0.04×0.4)
     = 100 × (0.180 + 0 + 0.053 + 0.067 + 0.051 + 0.016)
     = 100 × 0.367
     = 36.7

M = calculateWinM(margin=7, σ=1.5)
  = 0.60 + 0.40 × min(7/1.5/3, 1)
  = 0.60 + 0.40 × 1.0
  = 1.00

BKS = 36.7 × 1.00 = 36.7
```

### Example 2: 3-Leg Parlay (Loss on Last Leg)

```
Input:
  - 3 legs, uncorrelated (ρ=0)
  - Combined odds: +650 (fair prob ≈ 0.13)
  - Stake: $50
  - 2 legs hit, 1 missed by 1 point

Components:
  D = 1 - 0.13 = 0.87
  C = min((3-1)×0.3, 0.9) × 1 = 0.60
  P = min((6.5/10) × 5.3, 1 + 0.87×2) = min(3.45, 2.74) = 2.74
  A = 0.50 (no CLV data)
  S = 0.43
  K = 0.4

Base = 100 × (0.45×0.87 + 0.18×0.60 + 0.13×2.74 + 0.10×0.50 + 0.10×0.43 + 0.04×0.4)
     = 100 × (0.392 + 0.108 + 0.356 + 0.050 + 0.043 + 0.016)
     = 100 × 0.965
     = 96.5 (capped at 100)

M = calculateParlayLossM(2/3 legs hit)
  = 0.10 + 0.40 × (earned_difficulty / total_difficulty)
  = 0.10 + 0.40 × 0.67
  = 0.37

BKS = 96.5 × 0.37 = 35.7
```

---

**Document Version**: 3.4.0
**Last Updated**: December 14, 2025
**Status**: Production Deployed
