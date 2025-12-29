# CLAUDE.md - Backend (bks-backend)

> This file provides comprehensive context for Claude Code and any Task() clones.
> Last updated: 2025-12-14

---

<!-- SHARED CONTEXT START -->

## 1. Project Overview

**WhoKnowsBall** is a sports betting skill-tracking app that calculates a proprietary **BKS (Ball Knowing Score)** for each bet. Users don't wager real money - instead, the app measures betting skill through the BKS algorithm.

### Core Value Proposition
- Quantify betting skill objectively (not just win/loss)
- Social competition via leaderboards
- Track improvement over time
- No real money = no gambling regulations

### Architecture
```
┌─────────────────────┐     ┌─────────────────────┐
│   React Native App  │────▶│   Node.js Backend   │
│   (WhoKnowsBall)    │     │   (bks-backend)     │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
            ┌───────────┐      ┌───────────┐      ┌───────────┐
            │ Supabase  │      │   Redis   │      │ External  │
            │ (Postgres)│      │  (Cache)  │      │   APIs    │
            └───────────┘      └───────────┘      └───────────┘
```

### Repository Locations
- **Frontend**: `~/WhoKnowsBall` (symlink to `~/Documents/WhoKnowsBall`)
- **Backend**: `~/bks-backend` (symlink to `~/Documents/bks-backend`)

## 2. Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React Native | 0.82.0 | Cross-platform mobile |
| TypeScript | 5.8.3 | Type safety |
| Redux Toolkit | 2.9.0 | State management |
| React Navigation | 7.x | Navigation |
| Supabase JS | 2.76.0 | Auth client |
| Axios | 1.12.2 | HTTP client |
| MMKV | 3.3.3 | Fast key-value storage |
| Skia | 2.3.14 | Charts/visualizations |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x LTS | Runtime |
| Express | 4.x | HTTP framework |
| TypeScript | 5.3 | Type safety |
| Supabase JS | 2.74.0 | Database client |
| Redis | 5.8.3 | Caching |

### External APIs
| API | Purpose | Rate Limit |
|-----|---------|------------|
| **API-Sports** (PRIMARY) | Game data & scores | 7,500/day per sport |
| **The Odds API** (SECONDARY) | Betting odds | ~1,613/day |

## 3. API Contracts

### 3.1 Authentication Endpoints

```
POST /api/v1/auth/register
  Request: { email, password, username }
  Response: { success, message, user: { id, email, username } }
  Errors: 400 (validation), 409 (exists)

POST /api/v1/auth/login
  Request: { email, password } (email can be username)
  Response: { success, session: { access_token, refresh_token, expires_at }, user }
  Errors: 401 (invalid), 403 (suspended)

POST /api/v1/auth/refresh
  Request: { refresh_token }
  Response: { access_token, refresh_token, expires_at }

POST /api/v1/auth/logout
  Headers: Authorization: Bearer <token>
  Response: { success: true }
```

### 3.2 Betting Endpoints

```
POST /api/v1/bets/calculate
  Description: Calculate BKS without placing bet
  Auth: Not required
  Request: {
    bet_id, game_id, sport_key, status,
    market: { key: "h2h"|"spreads"|"totals", type: "2way"|"3way" },
    selection: "home"|"away"|"draw"|"over"|"under",
    odds: <american>, stake, stakePercentile, context
  }
  Response: { bks: 0-100, status, version: "3.4.0" }

POST /api/v1/bets
  Description: Place bet (single or parlay)
  Auth: Required
  Request (single): { game_id, sport_key, bet_type, market_type, selection, team, odds, stake }
  Request (parlay): { bet_type: "parlay", stake, legs: [...] }
  Response: { success, bet_id, bks_provisional, status, placed_at }
  Errors: 400, 401, 404 (game), 409 (duplicate within 5min)

GET /api/v1/bets
  Auth: Required
  Query: ?status=PENDING,LIVE,SETTLED&limit=50&offset=0
  Response: { bets: [...], total, hasMore }

GET /api/v1/bets/:betId
  Auth: Required
  Response: { bet: {...} }
```

### 3.3 Odds & Games Endpoints

```
GET /api/v1/odds/:sport
  Params: sport = americanfootball_nfl | basketball_nba | icehockey_nhl | baseball_mlb
  Response: { sport, games: [...], updated_at }

GET /api/v1/odds/upcoming/all
  Query: ?hours=24
  Response: { games: [...], by_sport: {...} }

GET /api/v1/games/:sport
  Response: { games: [...] }
```

### 3.4 Leaderboard & Stats Endpoints

```
GET /api/v1/leaderboard/global
  Query: ?limit=100&offset=0
  Response: { leaderboard: [{ rank, username, overall_bks, total_bets, win_rate }], updated_at }

GET /api/v1/leaderboard/sport/:sportKey
  Response: { leaderboard: [...] }

GET /api/v1/leaderboard/stats/user/:username
  Response: { user: {...}, by_sport: {...}, recent_bets: [...] }

GET /api/v1/leaderboard/users/stats
  Auth: Required
  Response: { user stats for current user }

GET /api/v1/leaderboard/users/bks-history
  Auth: Required
  Query: ?days=30 (0=all time, 1-365 supported)
  Response: { history: [{ date, bks }] }

GET /api/v1/metrics/activity
  Auth: Required
  Query: ?days=30
  Response: { history: [...], summary: {...} }
```

### 3.5 Health & Admin Endpoints

```
GET /health
  Auth: API Key required
  Response: { status: "healthy", timestamp, version }

GET /api/v1/health
  Auth: API Key required
  Response: { status, services: { database, redis, api_sports, odds_api } }

GET /api/v1/jobs/closing-odds/status
POST /api/v1/jobs/closing-odds/start
POST /api/v1/jobs/closing-odds/stop
POST /api/v1/jobs/closing-odds/run-now
```

### 3.6 User & Account Endpoints

```
GET /api/v1/users/profile
  Auth: Required
  Response: { success, profile: { id, username, email, full_name, phone, date_of_birth, overall_bks, total_bets, created_at } }
  Note: Filters deleted accounts

PUT /api/v1/users/profile
  Auth: Required
  Request: { full_name?, phone?, date_of_birth? }
  Response: { success, profile: {...} }
  Validation: date_of_birth=YYYY-MM-DD, phone=10-15 digits

PUT /api/v1/users/email
  Auth: Required
  Request: { new_email }
  Response: { success, message: "Verification email sent..." }
  Errors: 409 (email exists)

DELETE /api/v1/users/account
  Auth: Required
  Request: { confirmation: "DELETE" }
  Response: { deleted: true, message }
  Note: Soft delete - anonymizes PII, sets deleted_at

PUT /api/v1/auth/password
  Auth: Required
  Request: { current_password, new_password }
  Response: { success, message }
  Validation: 8+ chars, letter, number

POST /api/v1/auth/2fa/enable
  Auth: Required
  Response: { success, enabled: true, message: "Code sent to email" }
  Note: Stores code in Redis (5min TTL)

POST /api/v1/auth/2fa/disable
  Auth: Required
  Request: { code }
  Response: { success, enabled: false }

POST /api/v1/auth/2fa/verify
  Auth: Not required (login flow)
  Request: { email, code }
  Response: { success, verified, session: {...} }

POST /api/v1/support/contact
  Auth: Required
  Request: { subject, message }
  Response: { success, ticket_id, message }
  Rate Limit: 5/hour per user
  Subjects: "Bug Report" | "Feature Request" | "Account Issue" | "General Question" | "Other"

GET /api/v1/support/status
  Auth: Required
  Response: { success, email_configured, rate_limit: {...} }
```

## 4. Database Schema

### Core Tables

```sql
-- users: User profiles with BKS stats
users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  full_name VARCHAR(255),
  phone VARCHAR(20),
  date_of_birth DATE,
  overall_bks DECIMAL(5,1) DEFAULT 50.0,
  total_bets INTEGER DEFAULT 0,
  total_won INTEGER DEFAULT 0,
  total_lost INTEGER DEFAULT 0,
  total_push INTEGER DEFAULT 0,
  email_verified BOOLEAN,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(32),
  deleted_at TIMESTAMPTZ,  -- Soft delete timestamp
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- games: Sports games from API-Sports
games (
  id VARCHAR(255) PRIMARY KEY,  -- API-Sports game ID
  sport_key VARCHAR(50) NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  commence_time TIMESTAMPTZ NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(20) DEFAULT 'upcoming',  -- upcoming, live, completed
  completed BOOLEAN DEFAULT FALSE,
  odds_api_event_id VARCHAR(255)  -- Cross-reference to Odds API
)

-- bets: User bets with BKS components
bets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  game_id VARCHAR(255) REFERENCES games(id),
  sport_key VARCHAR(50) NOT NULL,
  bet_type VARCHAR(20) NOT NULL,  -- moneyline, spread, total, parlay
  market_type VARCHAR(10) NOT NULL,  -- 2way, 3way
  selection VARCHAR(20) NOT NULL,  -- home, away, draw, over, under
  team VARCHAR(255),
  line DECIMAL(5,1),
  odds INTEGER NOT NULL,
  stake DECIMAL(10,2) NOT NULL,
  bks_provisional DECIMAL(5,1),
  bks_final DECIMAL(5,1),
  status VARCHAR(20) DEFAULT 'PENDING',  -- PENDING, LIVE, SETTLING, SETTLED, VOID
  outcome VARCHAR(10),  -- WIN, LOSS, PUSH, VOID
  placed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ
)

-- parlay_legs: Individual legs for parlay bets
parlay_legs (
  id UUID PRIMARY KEY,
  bet_id UUID REFERENCES bets(id),
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
)

-- daily_quota_tracking: API usage monitoring
daily_quota_tracking (
  id UUID PRIMARY KEY,
  api_name VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  requests_made INTEGER DEFAULT 0,
  quota_limit INTEGER NOT NULL
)
```

### Row Level Security
- `users`: Anyone can SELECT; users can UPDATE own profile
- `bets`: Users can SELECT/INSERT own bets; service role manages all
- `games`: Public read access (no RLS)

## 5. BKS Algorithm v3.4.0

### Overview
The Ball Knowing Score (BKS) algorithm is a proprietary system that quantifies betting skill on a 0-100 scale.

### Components (Weights Redacted)
The algorithm evaluates bets across six dimensions:
- **Difficulty**: How hard was the bet to win?
- **Complexity**: Parlay vs single bet complexity
- **Payout**: Risk/reward potential
- **Accuracy**: Closing line value
- **Stake**: Conviction measurement
- **Context**: Game importance

### Output
- Score range: 0-100
- Higher scores indicate better betting decisions
- Accounts for both pre-game analysis and outcome

*Full algorithm details redacted for IP protection.*
*Contact: matthew.wood.wilson@gmail.com*

## 6. Authentication & Security

### Auth Flow
1. **Email/Password**: Supabase Auth → JWT token
2. **OAuth**: Google/Apple → check username → UsernameSetup if needed
3. **Biometric**: Store credentials in Keychain, prompt on app open
4. **24-hour deadline**: Unverified accounts get restricted after 24h

### Security Principles
- **BKS algorithm NEVER exposed to frontend** - calculation is server-side only
- API key required for ngrok/public access (`X-API-Key` header)
- HMAC-SHA256 signatures on bets for integrity
- Rate limiting: 60 req/min global, 10 req/min for BKS endpoints
- JWT tokens with auto-refresh

## 7. Business Rules

### Parlay Validation (DraftKings-style)
- Max 10 legs (regular parlay)
- Max 10 legs (same-game parlay)
- No opposite moneylines on same game
- No same team ML + spread
- No opposing spreads/totals on same game
- No duplicate selections
- NY state college sport restrictions

### Bet Placement Rules
- Game must exist and not be completed
- Odds must be valid American format (≤-100 or ≥100)
- Stake must be positive
- No duplicate bets within 5 minutes

### Settlement Timing
- Games marked completed when API-Sports returns final
- Settlement job runs every 5 minutes
- Closing odds captured T-2 minutes before commence

## 8. Constraints & Quotas

### NO/LOW COST MVP Requirement
- All services must have free tiers
- Optimize API calls aggressively

### API Quotas
| API | Daily Limit | Strategy |
|-----|-------------|----------|
| API-Sports | 7,500/sport | Primary for games/scores |
| The Odds API | ~1,613 | Secondary for odds only |
| Supabase | Free tier | 500MB database, 2GB bandwidth |
| Redis (Upstash) | 10,000 commands | 60s TTL for odds |

### Frontend Requirements
- 30-second polling for live odds (betting-grade UX)
- Offline-capable for viewing bets/stats
- Biometric auth for quick access

## 9. Development Workflow

### Git Commit Practice
- Commit messages: `type: description` (fix:, feat:, refactor:)
- Include Claude Code footer in commits
- Test before committing

### Testing Requirements
- Unit tests for critical components
- Integration tests for API routes
- 100% test success before commits

<!-- SHARED CONTEXT END -->

---

<!-- ========================================================================== -->
<!-- BACKEND-SPECIFIC CONTEXT                                                   -->
<!-- ========================================================================== -->

## 10. Node.js/Express Setup

### Runtime Environment
- Node.js 20.x LTS
- TypeScript with strict mode
- tsx for development (watch mode)
- esbuild for production builds

### Key Dependencies
```json
{
  "express": "4.18.2",
  "typescript": "5.3.3",
  "@supabase/supabase-js": "2.74.0",
  "redis": "5.8.3",
  "axios": "1.12.2",
  "express-rate-limit": "8.1.0",
  "cors": "2.8.5",
  "dotenv": "16.3.1",
  "helmet": "8.1.0",
  "fast-levenshtein": "3.0.0",
  "moment-timezone": "0.6.0",
  "uuid": "11.x",
  "nodemailer": "6.x"
}
```

### Environment Variables (.env)
```bash
# Required
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=[REDACTED]
SUPABASE_SERVICE_KEY=[REDACTED]
API_SPORTS_KEY=[REDACTED]
ODDS_API_KEY=[REDACTED]
REDIS_URL=redis://localhost:6379
BKS_SECRET=[REDACTED]  # HMAC signing key

# Optional
API_KEY_ENABLED=true  # Enable X-API-Key header
API_KEY=[REDACTED]    # Required if above is true
```

## 11. Project Structure

```
src/
├── api/
│   └── routes/
│       ├── v1/
│       │   └── auth.routes.ts      # Auth endpoints
│       ├── bets.routes.ts          # Bet management
│       ├── bks.routes.ts           # BKS calculation
│       ├── games.routes.ts         # Game data (combined with odds)
│       ├── health.routes.ts        # Health checks
│       ├── jobs.routes.ts          # Job management
│       ├── leaderboard.routes.ts   # Leaderboards
│       ├── metrics.routes.ts       # User metrics
│       ├── odds.routes.ts          # Odds fetching
│       ├── search.routes.ts        # Search endpoints
│       ├── support.routes.ts       # Support contact (email)
│       ├── teams.routes.ts         # Team data
│       ├── test.routes.ts          # Test endpoints
│       └── users.routes.ts         # User profile & account management
├── config/
│   ├── apiSportsConfig.ts          # API-Sports configuration
│   ├── constants.ts                # App constants
│   ├── redis.ts                    # Redis singleton
│   ├── supabase.ts                 # Lazy-loaded Supabase client
│   └── teamMappings.ts             # Team name normalization
├── database/
│   └── migrations/                 # SQL migration files
├── middleware/
│   ├── auth.middleware.ts          # JWT verification
│   └── security.middleware.ts      # API key, rate limiting
├── routes/
│   └── auth.routes.ts              # Additional auth routes
├── services/
│   ├── APISportsService.ts         # API-Sports integration
│   ├── DailyBKSService.ts          # Daily BKS snapshots
│   ├── EmailService.ts             # Email sending (Gmail/SendGrid)
│   ├── OddsEnhancementService.ts   # Odds enhancement features
│   ├── bks/
│   │   ├── BKSCalculator.ts        # Core BKS algorithm
│   │   ├── OverallBKSService.ts    # User overall BKS
│   │   └── types.ts                # BKS TypeScript types
│   ├── jobs/
│   │   ├── ClosingOddsJob.ts       # Capture closing odds
│   │   ├── GameCreationJob.ts      # Create games from API-Sports
│   │   ├── GameSyncJob.ts          # 3-tier game synchronization
│   │   ├── OddsMatchingJob.ts      # Match odds to games
│   │   ├── ScoresJob.ts            # Update live scores
│   │   ├── SettlementJob.ts        # Settle completed bets
│   │   ├── StaleGameDetectionJob.ts # Detect stale games
│   │   └── VerificationCheckJob.ts # User verification checks
│   └── odds/
│       ├── ClosingOddsCapture.ts   # Closing odds capture service
│       └── OddsAPIService.ts       # The Odds API client
├── test/                           # Test files
├── utils/
│   ├── gameIdValidation.ts         # Game ID validation utilities
│   ├── quotaCircuitBreaker.ts      # API quota circuit breaker
│   └── twoFactorAuth.ts            # 2FA code generation/verification
└── index.ts                        # Entry point
```

## 12. Services Architecture

### BKSCalculator.ts - Core Algorithm
```typescript
class BKSCalculator {
  // Entry point for calculation (implementation redacted)
  async calculate(bet: BetInput): Promise<BKSResult>

  // Component calculation methods (redacted)
  private calculateDifficulty(bet: BetInput): number
  private calculateComplexity(bet: BetInput): number
  private calculatePayout(bet: BetInput, D: number): number
  private async calculateAccuracy(bet: BetInput): Promise<number>
  private calculateStake(bet: BetInput): number
  private calculateContext(bet: BetInput): number

  // Converts American odds to fair probability (de-vigged)
  private devig(odds: number[]): number[]

  // Gets outcome multiplier based on status and cover margin
  private getMultiplier(outcome: string, D: number, bet: BetInput): number
}
```

### APISportsService.ts - Primary Game Data
```typescript
class APISportsService {
  async getGames(sport: string, date?: string): Promise<Game[]>
  async getLiveScores(gameIds: string[]): Promise<Score[]>
  // Primary source for game data and live scores
}
```

### DailyBKSService.ts - BKS History
```typescript
class DailyBKSService {
  async getRecentSnapshots(userId: string, days: number): Promise<BKSHistory[]>
  // Powers the BKS history chart - days=0 means all time
}
```

### Job Scheduler Pattern
```typescript
class JobName {
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs: number): void {
    this.interval = setInterval(() => this.run(), intervalMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async run(): Promise<void> {
    // Job logic
  }
}
```

## 13. Background Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| **GameCreationJob** | Daily 2AM + startup | Fetches games from API-Sports for all sports |
| **GameSyncJob** | 3-tier polling | Synchronizes game data with 3-tier priority system |
| **OddsMatchingJob** | 40 seconds | Matches Odds API events to games by team/time |
| **ScoresJob** | 30 seconds | Updates live scores from API-Sports |
| **SettlementJob** | 5 minutes | Settles completed bets, calculates final BKS |
| **ClosingOddsJob** | Continuous | Captures odds T-2 min before game start |
| **StaleGameDetectionJob** | Periodic | Detects and handles stale game data |
| **VerificationCheckJob** | Periodic | Checks user verification status |

### GameCreationJob Details
- Fetches from API-Sports `/games` endpoint
- Creates/updates games in Supabase
- Handles team name normalization via `teamMappings.ts`

### OddsMatchingJob Details
- Fetches from The Odds API
- Matches to existing games by team names + commence time
- Updates `odds_api_event_id` for cross-reference
- Caches odds in Redis (60s TTL)

### SettlementJob Details
- Queries completed games with unsettled bets
- Determines outcome (WIN/LOSS/PUSH)
- Calls BKSCalculator for final BKS
- Updates user's overall_bks via OverallBKSService

## 14. Redis Caching

### Cache Keys
```
odds:<sport>              # Cached odds for sport (60s TTL)
leaderboard:global        # Global leaderboard (5min TTL)
leaderboard:sport:<key>   # Sport-specific leaderboard (5min TTL)
rate:<ip>                 # Rate limiting counter (1min window)
closing_odds:<game_id>    # Closing odds snapshot (24h TTL)
```

### Usage Patterns
```typescript
// Odds caching (using redis package v5.x)
const cached = await redis.get(`odds:${sport}`);
if (cached) return JSON.parse(cached);

const fresh = await oddsAPI.getOdds(sport);
await redis.setEx(`odds:${sport}`, 60, JSON.stringify(fresh));
return fresh;
```

## 15. External API Integration

### API-Sports (Primary)
```typescript
// Endpoints used:
GET /games?date=YYYY-MM-DD&league={id}&season={year}
GET /games?id={game_id}  // Live score updates

// Sport league IDs:
{ NFL: 1, NBA: 12, MLB: 1, NHL: 57 }

// Rate limit: 7,500/day per sport
```

### The Odds API (Secondary)
```typescript
// Endpoints used:
GET /sports/{sport}/odds?regions=us&markets=h2h,spreads,totals

// Sport keys:
{ americanfootball_nfl, basketball_nba, baseball_mlb, icehockey_nhl }

// Rate limit: ~1,613/day (500 requests remaining = 1,613 effective)
```

### Team Name Normalization
```typescript
// teamMappings.ts provides canonical names
const TEAM_ALIASES = {
  'Los Angeles Lakers': ['LA Lakers', 'L.A. Lakers', 'Lakers'],
  'New York Knicks': ['NY Knicks', 'Knicks'],
  // ... more mappings
};

function normalizeTeam(name: string): string {
  // Returns canonical name or original if not found
}
```

## 16. BKS Calculator Implementation

### File: `src/services/bks/BKSCalculator.ts`

*Algorithm implementation details redacted for IP protection.*

The BKSCalculator service implements the proprietary BKS algorithm described in Section 5. Key methods include:
- `calculate()`: Main entry point for BKS calculation
- Component calculation methods (redacted)
- `devig()`: Converts American odds to fair probability
- `getMultiplier()`: Outcome-based score multiplier

For algorithm details, see Section 5 or contact matthew.wood.wilson@gmail.com

## 17. Middleware Stack

### Request Flow
```
Request → security.middleware → auth.middleware → route handler → response
```

### security.middleware.ts
```typescript
// API Key validation (for ngrok/public access)
function apiKeyMiddleware(req, res, next) {
  if (process.env.API_KEY_ENABLED !== 'true') return next();
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
```

### auth.middleware.ts
```typescript
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}
```

## 18. Database Client Management

### Lazy-loaded Supabase Client
```typescript
// config/supabase.ts
let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return supabaseClient;
}
```

### Service Role vs Anon Key
- **Service Role**: Used for backend operations (bypasses RLS)
- **Anon Key**: Used for user-context operations (respects RLS)

## 19. Development Commands

```bash
# Development
npm run dev          # Start with tsx watch mode
npm run build        # Build for production
npm start            # Run production build

# Testing
npm test             # Run Jest tests
npm test -- --watch  # Watch mode
npm test -- --coverage

# Database
npm run db:migrate   # Run migrations (if applicable)
npm run db:seed      # Seed test data

# Utilities
npm run lint         # ESLint check
npm run typecheck    # TypeScript check
```

## 20. Deployment Configuration

### Production Environment
- Platform: Railway / Render / Heroku
- Node.js buildpack
- Environment variables set in dashboard

### Health Check
- `GET /health` returns `{ status: "healthy", timestamp, version }`
- Used by load balancers for instance health

### Scaling Considerations
- Stateless design allows horizontal scaling
- Redis handles session/cache sharing
- Background jobs should use leader election for multi-instance

## 21. Common Issues & Solutions

1. **Redis connection failed**
   - Ensure Redis is running: `redis-server`
   - Check REDIS_URL in .env

2. **API quota exceeded**
   - Check `daily_quota_tracking` table
   - Reduce polling frequency

3. **Team name mismatch**
   - Add alias to `teamMappings.ts`
   - Run OddsMatchingJob manually

4. **Rate limiter issues with ngrok**
   - Set `xForwardedForHeader: false` in rate limiter config

5. **Supabase connection timeout**
   - Check network connectivity
   - Verify SUPABASE_URL is correct

6. **BKS calculation returns NaN**
   - Check for missing odds data
   - Verify stake is positive number

7. **JWT token expired errors**
   - Frontend should auto-refresh
   - Check token expiration time in Supabase settings
