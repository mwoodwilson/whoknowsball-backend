# Product Requirements Document: WhoKnowsBall

**Version:** 1.0
**Last Updated:** December 28, 2025
**Status:** Active Development
**Document Owner:** Product Management
**Stakeholders:** Engineering, Design, Business Development

---

## 1. Executive Summary

WhoKnowsBall is a mobile-first sports betting skill-tracking platform that transforms recreational sports betting into a competitive skill sport. By measuring betting decisions through our proprietary Ball Knowing Score (BKS) algorithm rather than tracking real money, we enable users to quantify their sports knowledge, compete on leaderboards, and improve their betting acumen without financial risk or regulatory friction.

**Core Innovation:** A serverless scoring algorithm that evaluates betting skill across six dimensions—difficulty, complexity, payout conviction, closing line value, stake significance, and game context—producing an objective 0-100 score that rewards smart betting decisions regardless of outcome.

**Market Opportunity:** The sports betting education market is underserved, with millions of casual bettors seeking to improve but lacking objective feedback. WhoKnowsBall bridges this gap by gamifying skill development in a zero-cost, regulation-free environment.

---

## 2. Problem Statement

### Current Market Pain Points

**For Sports Bettors:**
- **No objective skill measurement** — Win/loss records don't distinguish lucky wins from skilled analysis
- **Lack of actionable feedback** — Traditional betting apps don't explain why bets succeed or fail
- **High financial barriers** — Learning through real-money betting is expensive and risky
- **No competitive outlet** — Solo betting lacks the social engagement of competitive sports

**For the Industry:**
- **Regulatory complexity** — Real-money betting faces state-by-state restrictions and compliance costs
- **User acquisition cost** — Traditional sportsbooks spend $500-1000 per customer acquisition
- **Retention challenges** — 70% of new bettors quit within 6 months due to losses

### Why Existing Solutions Fail

| Solution Type | Limitation |
|---------------|------------|
| **Traditional Sportsbooks** | Focus on transactions, not education; require real money |
| **Betting Tip Services** | Subjective, unverified, often scams; no skill tracking |
| **Fantasy Sports** | Different skill set (roster management vs. odds analysis) |
| **Betting Simulators** | Lack social features and sophisticated scoring; feel artificial |

### Our Hypothesis

By decoupling betting skill measurement from financial outcomes, we can create a sustainable engagement loop that:
1. Attracts users seeking skill development without financial risk
2. Retains users through competitive leaderboards and measurable improvement
3. Monetizes through premium analytics, coaching, and partnerships (future phases)

---

## 3. Target Users

### Primary Persona: "The Aspiring Sharp"

**Demographics:**
- Age: 25-40
- Gender: 70% male, 30% female
- Income: $50k-$120k
- Location: Urban/suburban, sports-centric markets

**Psychographics:**
- Consumes 10+ hours/week of sports content
- Casually bets on 2-5 games per week ($50-$200 stakes)
- Wants to improve betting ROI but lacks structured feedback
- Competitive personality, enjoys leaderboards and achievements

**Behavioral Traits:**
- Uses 2-3 betting apps (DraftKings, FanDuel, BetMGM)
- Follows sports analysts on Twitter/podcasts
- Tracks personal betting in spreadsheets (occasionally)
- Frustrated by inconsistent results despite "doing research"

**Jobs to Be Done:**
- *When* I place a bet, *I want to* know if my analysis was sound, *so I can* improve my decision-making over time
- *When* I'm learning betting strategy, *I want to* compete against others, *so I can* benchmark my progress
- *When* I analyze games, *I want to* quantify my edge, *so I can* bet with confidence

### Secondary Persona: "The Social Competitor"

**Key Differences:**
- Less interested in betting improvement, more interested in social competition
- Uses WhoKnowsBall primarily for friend groups and office pools
- Lower sports betting frequency (1-2 bets/week)
- Motivated by bragging rights over skill development

### Anti-Persona: Professional Bettors

**Why They're Not Our Target:**
- Already have sophisticated tracking systems
- Unlikely to share proprietary strategies on public platform
- Need features (advanced analytics, API access) beyond MVP scope
- Small market size (<1% of betting population)

---

## 4. Product Vision

### 3-Year Vision Statement

"WhoKnowsBall becomes the default platform where sports fans develop and prove their betting expertise, creating a global community of skilled bettors who compete, learn, and connect through objective skill measurement."

### Strategic Pillars

1. **Skill-First Philosophy** — Every feature prioritizes skill development over entertainment gambling
2. **Social Competition** — Leaderboards, friend groups, and challenges drive engagement
3. **Data-Driven Insights** — Advanced analytics help users understand their strengths/weaknesses
4. **Platform Agnostic** — Users can track bets across any sportsbook without platform lock-in

### Success Vision (2027)

- **1M+ active users** tracking bets monthly
- **Top 3** sports app by engagement time in key markets
- **50%+ 6-month retention** among active bettors
- **B2B partnerships** with sportsbooks licensing BKS algorithm for responsible gambling

---

## 5. Core Features

### Priority Framework

**P0 (Must-Have for Launch):** Features required for core value proposition
**P1 (Should-Have for Launch):** Features that significantly enhance experience
**P2 (Nice-to-Have for Launch):** Features that polish experience but not critical

---

### P0: Core Betting Flow

#### 5.1 Game Browser & Odds Display
**User Story:** As a bettor, I want to browse upcoming games with live odds so I can identify betting opportunities.

**Requirements:**
- Real-time odds from API-Sports (games) + The Odds API (lines)
- Support for NFL, NBA, NHL, MLB
- Filter by sport, date, time
- Display moneylines, spreads, totals (h2h/spreads/totals markets)
- 30-second polling for live odds (betting-grade UX)
- Fuzzy search by team name

**Acceptance Criteria:**
- Odds update within 30 seconds of market changes
- Game card shows home/away teams, commence time, all market types
- Search returns results for partial team names (e.g., "Lakers" → "Los Angeles Lakers")

**Technical Notes:**
- Redis caching (60s TTL) to minimize API quota usage
- Dynamic polling: 3-tier system (live/imminent/future games)

---

#### 5.2 BKS Calculation Engine
**User Story:** As a bettor, I want to receive an objective skill score for each bet so I can measure my decision quality.

**Requirements:**
- Server-side BKS algorithm (never exposed to client)
- Score range: 0-100 (one decimal place)
- Real-time provisional scores (before game starts)
- Final scores after settlement (game completion + 6-hour delay)
- Support single bets and parlays (up to 10 legs)

**Algorithm Components (v3.4.0):**
- **Difficulty (45%):** Fair win probability (de-vigged odds)
- **Complexity (18%):** Parlay leg count with correlation penalty
- **Payout (13%):** Return multiple with conviction multiplier (stake-weighted)
- **Accuracy (10%):** Closing line value (CLV)
- **Stake (10%):** Logarithmic stake significance
- **Context (4%):** Game importance (playoffs > regular season)

**Acceptance Criteria:**
- Client receives only `{bks, status, version}` (no internal components)
- Calculation latency <50ms
- Win BKS always > Loss BKS for same bet characteristics
- BKS never exceeds 100.0

**Security Requirements:**
- HMAC-SHA256 signatures on bet placements
- Rate limiting: 10 req/min for BKS endpoints
- Response sanitization middleware strips all internal data

---

#### 5.3 Bet Placement & Tracking
**User Story:** As a bettor, I want to record my bets and track their status so I can monitor my performance.

**Requirements:**
- Place single bets (moneyline, spread, total)
- Place parlay bets (2-10 legs, regular or same-game)
- Duplicate bet prevention (5-minute window)
- Bet status tracking: PENDING → LIVE → SETTLING → SETTLED
- View active bets and settled history
- Filter by status, sport, date range

**Parlay Validation (DraftKings Rules):**
- No opposing moneylines on same game
- No same-team ML + spread conflicts
- No opposing spreads/totals on same game
- No duplicate selections
- Max 10 legs per parlay

**Acceptance Criteria:**
- Bet recorded in <500ms
- Provisional BKS displayed immediately
- Status updates within 5 minutes of game state changes
- 99.9% data accuracy on bet outcomes

---

### P0: User Authentication & Profile

#### 5.4 Multi-Channel Authentication
**User Story:** As a user, I want to sign up quickly and securely so I can start tracking bets immediately.

**Requirements:**
- Email/password registration with verification
- OAuth (Google Sign-In, Apple Sign-In)
- Biometric authentication (Face ID, Touch ID)
- Username uniqueness validation
- 24-hour verification deadline with restrictions

**OAuth Flow:**
1. User signs in with Google/Apple
2. System checks if username exists
3. If no username → UsernameSetup modal (non-dismissible)
4. If unverified email after 24h → restricted access (view-only mode)

**Acceptance Criteria:**
- Email verification sent within 5 seconds
- Biometric auth reduces login time to <2 seconds
- Username validation real-time (debounced 300ms)
- OAuth sign-in completes in <3 seconds

---

#### 5.5 User Profile & Stats Dashboard
**User Story:** As a user, I want to view my overall performance and BKS trends so I can track improvement.

**Requirements:**
- Overall BKS (weighted average of settled bets)
- Total bets, win rate, push rate
- BKS history chart (7/30/90/365/all-time)
- Sport-specific performance breakdowns
- Profile editing (full name, phone, date of birth, email)
- Account management (password change, 2FA, account deletion)

**My BKS Screen Components:**
- Circular BKS gauge (animated, color-coded)
- Line chart with time period selector
- Metrics cards (total bets, win rate, avg stake)
- Sport performance chart (radar or bar chart)

**Acceptance Criteria:**
- BKS chart loads in <1 second
- All-time history includes every settled bet
- Sport breakdowns show at least 5 bets (hide if <5)

---

### P1: Social & Competitive Features

#### 5.6 Global Leaderboards
**User Story:** As a competitive user, I want to see how I rank against others so I can benchmark my skill.

**Requirements:**
- Global leaderboard (top 100)
- Sport-specific leaderboards (NFL, NBA, NHL, MLB)
- Ranking by overall BKS (minimum 10 settled bets)
- Display username, BKS, total bets, win rate
- User's rank highlighted (if in top 100)
- Real-time updates (5-minute cache)

**Acceptance Criteria:**
- Leaderboard loads in <2 seconds
- Min bet threshold prevents gaming with single lucky bets
- User can view their rank even if outside top 100

**Future Enhancements (P2):**
- Friend leaderboards
- Weekly/monthly leaderboards
- Prize pools or achievements for top performers

---

#### 5.7 User Profile Lookup
**User Story:** As a user, I want to view other users' public profiles so I can analyze their betting patterns.

**Requirements:**
- Public profile page for any username
- Display overall BKS, total bets, win rate
- Sport-specific performance
- Recent bets (last 10, anonymized stakes)
- Privacy: no PII, no bet timestamps (prevent tailing)

**Acceptance Criteria:**
- Profile loads in <1.5 seconds
- Cannot view bet details beyond selection/outcome
- Deleted accounts return 404

---

### P1: User Experience Enhancements

#### 5.8 Email Verification System
**User Story:** As a platform, I want to verify user emails so I can ensure account security and enable communications.

**Requirements:**
- Verification email sent on registration
- In-app banner for unverified users (dismissible)
- 24-hour grace period, then restrictions (view-only mode)
- Resend verification option
- Verification toast on successful confirmation

**Acceptance Criteria:**
- Verification email arrives within 1 minute
- Banner appears on all screens until verified
- Restrictions enforced exactly 24 hours post-registration

---

#### 5.9 Contact Support
**User Story:** As a user, I want to contact support when I have issues so I can get help.

**Requirements:**
- In-app contact form
- Categories: Bug Report, Feature Request, Account Issue, General Question
- Email notification to support team
- Rate limiting: 5 requests/hour per user
- Auto-reply confirmation

**Acceptance Criteria:**
- Form submission within 3 seconds
- User receives confirmation email immediately
- Support team receives ticket within 5 minutes

---

### P2: Advanced Features (Post-Launch)

#### 5.10 Two-Factor Authentication (2FA)
**User Story:** As a security-conscious user, I want 2FA so I can protect my account.

**Requirements:**
- Email-based 2FA codes (6-digit)
- Optional enable/disable in account settings
- 5-minute code expiration
- Redis-backed code storage

**Acceptance Criteria:**
- Code sent within 10 seconds
- Login flow extended by <5 seconds

---

#### 5.11 Bet History Export
**User Story:** As an analytical user, I want to export my bet history so I can perform custom analysis.

**Requirements:**
- CSV export of all bets
- Include game, selection, odds, stake, BKS, outcome
- Email download link (file expires after 24 hours)

**Acceptance Criteria:**
- Export generated in <30 seconds
- CSV includes all historical data

---

## 6. User Stories with Acceptance Criteria

### Story 1: First-Time User Onboarding
**As a** new user,
**I want to** sign up and place my first bet within 2 minutes,
**So that** I can quickly experience the core value proposition.

**Acceptance Criteria:**
- Registration completes in <30 seconds
- Game browser shows upcoming games immediately
- Tutorial overlay explains BKS concept (skippable)
- First bet placement guided with tooltips

---

### Story 2: Analyzing Bet Quality
**As a** bettor who just placed a bet,
**I want to** see my provisional BKS immediately,
**So that** I can understand the quality of my decision before the game starts.

**Acceptance Criteria:**
- BKS displayed within 500ms of bet placement
- Score breakdown shows "harder bets = higher potential BKS"
- Tooltip explains provisional vs. final scoring

---

### Story 3: Tracking Improvement Over Time
**As a** user who has placed 20+ bets,
**I want to** view my BKS trend over the last 30 days,
**So that** I can see if my betting skill is improving.

**Acceptance Criteria:**
- Chart shows daily BKS snapshots
- Trend line indicates upward/downward trajectory
- Comparison to personal best BKS

---

### Story 4: Competing with Peers
**As a** competitive user,
**I want to** see where I rank on the global leaderboard,
**So that** I can gauge my skill level against the community.

**Acceptance Criteria:**
- Global leaderboard accessible from main navigation
- My rank highlighted (if in top 100) or shown separately
- Leaderboard updates every 5 minutes

---

### Story 5: Verifying Email to Unlock Full Access
**As a** new user with unverified email,
**I want to** receive clear prompts to verify my email,
**So that** I don't lose access after 24 hours.

**Acceptance Criteria:**
- Banner appears on all screens (dismissible)
- Countdown timer shows hours remaining
- One-click resend verification
- Verification success toast with confetti animation

---

### Story 6: Recovering from Forgotten Password
**As a** user who forgot my password,
**I want to** reset it via email,
**So that** I can regain access to my account.

**Acceptance Criteria:**
- Reset link sent within 1 minute
- Link expires after 1 hour
- New password meets requirements (8+ chars, letter, number)
- Auto-login after successful reset

---

### Story 7: Managing Account Security
**As a** user concerned about account security,
**I want to** enable 2FA and change my password,
**So that** I can protect my account from unauthorized access.

**Acceptance Criteria:**
- 2FA toggle in account settings
- Password change requires current password verification
- Success confirmation with logout on password change

---

### Story 8: Deleting My Account
**As a** user who no longer wants to use WhoKnowsBall,
**I want to** permanently delete my account,
**So that** my data is removed from the platform.

**Acceptance Criteria:**
- Confirmation modal with "DELETE" typed input
- Soft delete: anonymizes PII, sets deleted_at timestamp
- Bets remain for leaderboard integrity but anonymized
- Account cannot be recovered after 30 days

---

### Story 9: Reporting Bugs
**As a** user who encounters a bug,
**I want to** submit a bug report with details,
**So that** the team can fix the issue.

**Acceptance Criteria:**
- Bug report form includes description field (500 char max)
- Optional screenshot upload
- Ticket ID returned for tracking
- Confirmation email sent to user

---

### Story 10: Viewing Another User's Profile
**As a** curious user,
**I want to** view another user's public profile,
**So that** I can learn from their betting patterns.

**Acceptance Criteria:**
- Profile shows overall BKS, win rate, total bets
- Recent bets displayed (last 10, no stakes shown)
- Sport-specific performance chart
- No PII or contact information

---

## 7. Technical Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile App (React Native)                │
│  ┌──────────────┬──────────────┬──────────────┐            │
│  │   Home       │   My Bets    │   My BKS     │            │
│  │  (Browse)    │  (Tracking)  │   (Stats)    │            │
│  └──────────────┴──────────────┴──────────────┘            │
│           │                                                  │
│           │  HTTPS/REST (JWT Auth + API Key)                │
│           ▼                                                  │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Node.js Backend (Express)                  │
│  ┌──────────────┬──────────────┬──────────────┐            │
│  │  Auth        │  Bets API    │  BKS Engine  │            │
│  │  Middleware  │  (CRUD)      │  (v3.4.0)    │            │
│  └──────────────┴──────────────┴──────────────┘            │
│           │              │              │                    │
│           │              │              │                    │
│  ┌────────▼──────────────▼──────────────▼────────┐         │
│  │         Background Jobs (Cron)                 │         │
│  │  • GameCreationJob (daily 2AM)                 │         │
│  │  • OddsMatchingJob (30s interval)              │         │
│  │  • ScoresJob (30s dynamic polling)             │         │
│  │  • SettlementJob (5min interval)               │         │
│  │  • ClosingOddsJob (T-2min capture)             │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
            │              │              │
            ▼              ▼              ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Supabase    │ │     Redis     │ │ External APIs │
│  (Postgres)   │ │   (Upstash)   │ │               │
│               │ │               │ │ • API-Sports  │
│ • Auth        │ │ • Odds cache  │ │ • Odds API    │
│ • Users       │ │ • Leaderboard │ │               │
│ • Bets        │ │ • Rate limits │ │               │
│ • Games       │ │               │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
```

### Technology Stack Rationale

#### Frontend: React Native 0.82.0
**Why:** Cross-platform mobile development with native performance, strong ecosystem, 70%+ code reuse across iOS/Android

**Key Dependencies:**
- Redux Toolkit (state management)
- React Navigation (routing)
- Supabase JS (auth client)
- MMKV (fast local storage)
- Skia (high-performance charts)

#### Backend: Node.js 20 LTS + Express
**Why:** Fast development velocity, TypeScript support, strong async/await for job scheduling

**Key Dependencies:**
- Supabase JS (database client)
- Redis (caching, rate limiting)
- Axios (HTTP client for external APIs)
- Express Rate Limit (quota protection)

#### Database: Supabase (Postgres)
**Why:** Generous free tier (500MB DB, 2GB bandwidth), built-in auth, real-time capabilities, Row-Level Security (RLS)

**Schema Highlights:**
- `users` table: Profile + aggregate BKS stats
- `games` table: Game data from API-Sports
- `bets` table: User bets with BKS components
- `parlay_legs` table: Individual parlay leg tracking
- `bks_daily_snapshots` table: Historical BKS for charting

#### Cache: Redis (Upstash)
**Why:** Free tier (10k commands/day), low latency, TTL-based expiration

**Use Cases:**
- Odds caching (60s TTL)
- Leaderboard caching (5min TTL)
- Rate limiting counters
- Closing odds snapshots (24h TTL)

#### External APIs

**API-Sports (Primary):**
- Role: Game data, live scores, final scores
- Quota: 7,500 requests/day per sport
- Strategy: Daily bulk fetch (2AM), dynamic polling for live games

**The Odds API (Secondary):**
- Role: Betting odds only (h2h, spreads, totals)
- Quota: ~166,667 requests/day (5M/month)
- Strategy: 30-second polling, skip if no games in next 4 hours

### Data Flow: Bet Placement to Settlement

```
1. User selects game + market → Frontend
2. Frontend calls POST /api/v1/bets → Backend
3. Backend validates:
   - Game exists and not completed
   - Odds format valid (American ≤-100 or ≥100)
   - No duplicate bet within 5 minutes
   - Parlay rules (if applicable)
4. Backend calls BKSCalculator.calculate():
   - Status: PENDING
   - Returns provisional BKS
5. Backend stores bet in database:
   - bks_provisional = provisional score
   - status = PENDING
6. Return to client: { bet_id, bks_provisional, status }

--- Game starts ---

7. ScoresJob detects game.status = 'live' (30s polling)
8. SettlementJob transitions bet PENDING → LIVE
9. ScoresJob updates live scores every 30s

--- Game ends ---

10. ScoresJob marks game.completed = true
11. SettlementJob (5min interval) detects completed game with LIVE bets
12. SettlementJob determines outcome (WIN/LOSS/PUSH)
13. BKSCalculator.calculate() with status=SETTLED, outcome=WIN:
    - Calculates final BKS with outcome multiplier
14. Update bet:
    - bks_final = final score
    - outcome = WIN
    - status = SETTLED
    - settled_at = now
15. OverallBKSService.updateUserBKS():
    - Recalculate weighted average of all settled bets
    - Update users.overall_bks
16. DailyBKSService.updateDailySnapshot():
    - Update bks_daily_snapshots for history chart
```

### Security Architecture

**Authentication:**
- JWT tokens from Supabase Auth
- Auto-refresh on expiration
- API key required for ngrok/public access (X-API-Key header)

**BKS Algorithm Protection:**
- Server-side calculation only (never exposed to client)
- Response sanitization middleware strips internal components
- HMAC-SHA256 signatures on bet placements

**Rate Limiting:**
- Global: 60 requests/minute
- BKS endpoints: 10 requests/minute
- Contact support: 5 requests/hour

**Data Privacy:**
- Row-Level Security (RLS) on Supabase tables
- Soft delete (anonymize PII, set deleted_at)
- Public profiles hide stakes, timestamps, PII

---

## 8. BKS Algorithm Overview

### What It Measures

The Ball Knowing Score quantifies **betting skill on a 0-100 scale** by evaluating bets across six dimensions:

1. **Difficulty** — How hard was the bet to win? (Based on fair probability)
2. **Complexity** — How sophisticated was the bet construction? (Parlay legs)
3. **Payout** — How much conviction did you show? (Stake-weighted return multiple)
4. **Accuracy** — Did you beat the market? (Closing line value)
5. **Stake** — How significant was the wager? (Logarithmic scaling)
6. **Context** — How important was the game? (Playoffs > regular season)

### Algorithm

The BKS algorithm combines these six components with proprietary weighting and applies outcome-based multipliers to produce a final score from 0-100.

**Note:** The complete algorithm formula, component weights, and calculation logic are proprietary intellectual property and have been redacted from this public repository. For licensing inquiries, contact matthew.wood.wilson@gmail.com.

### Key Invariants

- **Win > Loss:** For identical bets, winning always scores higher than losing
- **No Gaming:** Payout capped by difficulty (easy bets can't score 100 via high stakes)
- **Skill Rewarded:** Closing line value and difficulty heavily weighted
- **Privacy Protected:** Clients receive only `{bks, status, version}` (no component breakdown)

### Why This Matters for Product

**User Motivation:**
- Objective feedback on bet quality (not just luck)
- Measurable improvement over time
- Competitive edge through CLV optimization

**Business Model:**
- Proprietary IP creates moat against competitors
- Algorithm versioning allows continuous improvement
- B2B licensing opportunity (responsible gambling tools for sportsbooks)

**Regulatory Advantage:**
- No real money = no gambling license required
- Pure skill measurement = legal in all 50 states
- Educational positioning avoids regulatory scrutiny

---

## 9. Success Metrics

### North Star Metric
**Weekly Active Users (WAU) placing ≥1 bet**

*Rationale:* Weekly betting frequency indicates strong engagement and aligns with typical sports betting behavior (weekend-heavy).

### Primary KPIs

| Metric | Target (6 months) | Measurement | Owner |
|--------|-------------------|-------------|-------|
| **Weekly Active Users** | 10,000 WAU | Unique users placing ≥1 bet/week | Growth |
| **6-Month Retention** | 50% | Users active in month 6 vs. month 1 | Product |
| **Avg Bets per User (Weekly)** | 3.5 bets | Total bets / WAU | Product |
| **BKS Calculation Accuracy** | 99.9% | Correct settlement outcomes | Eng |
| **API Uptime** | 99.5% | Backend availability | Eng |

### Secondary KPIs

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Leaderboard Engagement** | 30% of WAU view leaderboard weekly | Indicates social/competitive interest |
| **Email Verification Rate** | 70% within 24 hours | Account security and communication channel |
| **Avg BKS Improvement** | +5 points over 30 bets | Validates skill development value prop |
| **Parlay Usage** | 20% of bets are parlays | Advanced feature adoption |
| **Profile Views** | 1.5 views per user per week | Social discovery and learning |

### Anti-Metrics (What We Don't Optimize For)

- **Total Bet Volume** — We're not a sportsbook; quantity ≠ quality
- **Session Duration** — Long sessions could indicate confusion, not engagement
- **Push Notifications Sent** — Avoiding spammy growth hacks

### Measurement Methodology

**Data Sources:**
- Backend analytics (PostgreSQL queries)
- Redis metrics (cache hit rates, rate limit triggers)
- Client-side events (React Native analytics SDK)

**Dashboards:**
- Daily metrics dashboard (Metabase or Redash)
- Weekly executive summary (automated email)
- Monthly cohort retention analysis

**A/B Testing Framework:**
- Feature flags for controlled rollouts
- 95% confidence threshold for ship decisions
- Min 7-day test duration for behavioral changes

---

## 10. Future Roadmap

### Phase 2: Social & Community (Q2 2026)

**Friend Groups & Challenges**
- Private leaderboards for friend groups
- Head-to-head challenges (e.g., "Best NBA bet this week")
- Group chat integration (comment on bets)

**Achievements & Gamification**
- Badges for milestones (100 bets, 70+ BKS, 10-game win streak)
- Seasonal leaderboard resets with prizes
- "Bettor of the Month" recognition

**User-Generated Content**
- Bet reasoning notes (optional public sharing)
- Community-voted "Bet of the Week"
- Expert user verification badges

**Estimated Impact:** +30% retention, +50% referral rate

---

### Phase 3: Analytics & Insights (Q3 2026)

**Advanced Stats Dashboard**
- Win rate by bet type (moneyline vs. spread vs. total)
- Bankroll management simulator
- Edge calculator (compare your CLV to market)
- Sport/league performance heatmap

**AI-Powered Insights**
- "You tend to overbias home favorites in NBA"
- "Your BKS drops 15% on late-night bets"
- Personalized bet recommendations based on historical performance

**Bet Tracking Integrations**
- Import bet history from DraftKings/FanDuel (API partnerships)
- Auto-track bets via sportsbook screenshots (OCR)

**Estimated Impact:** +40% engagement, 20% premium conversion (future monetization)

---

### Phase 4: Monetization & Partnerships (Q4 2026)

**Premium Subscription ($9.99/month)**
- Unlimited bet history export
- Advanced analytics (all insights unlocked)
- Ad-free experience
- Custom leaderboards (create your own groups)

**Coaching Marketplace**
- Verified experts offer 1-on-1 coaching
- WhoKnowsBall takes 20% commission
- Coaches verified by sustained 75+ BKS over 100 bets

**B2B Licensing**
- License BKS algorithm to sportsbooks for responsible gambling tools
- "Your betting skill score: 62/100 — consider reducing stakes"
- Revenue share: $0.10 per active user per month

**Affiliate Partnerships**
- Sportsbook sign-up referrals (user gets bonus, we get commission)
- Sports data/analytics tool partnerships

**Estimated Revenue:** $50k MRR by end of Q4 2026

---

### Phase 5: Expansion (2027+)

**International Markets**
- Soccer (EPL, La Liga, Champions League)
- Cricket (IPL, international matches)
- Esports (League of Legends, CS:GO)

**Platform Expansion**
- Web app for desktop betting
- Browser extension (overlay BKS on sportsbook sites)
- API for third-party developers

**Advanced Features**
- Live betting support (in-game odds updates)
- Hedge calculator (optimize parlay hedging)
- Syndicate mode (group bankroll management)

---

## 11. Open Questions & Decisions

### Technical Decisions

**Q1: Should we support live in-game betting in Phase 1?**
- **Pros:** More engagement opportunities, higher bet volume
- **Cons:** API quota strain (30s polling for live odds), complex BKS calculation (time-aware scoring)
- **Recommendation:** No — Phase 2 feature. Focus on pre-game betting for MVP.
- **Owner:** Engineering Lead
- **Deadline:** January 15, 2026

**Q2: How do we handle API quota exhaustion scenarios?**
- **Current:** Circuit breaker with 3 modes (NORMAL/DEGRADED/CRITICAL)
- **Open:** Should we show users a "reduced service" banner in CRITICAL mode?
- **Recommendation:** Yes — transparency builds trust. Show banner: "Live odds temporarily unavailable due to high demand."
- **Owner:** Product Manager
- **Deadline:** January 20, 2026

---

### Product Decisions

**Q3: Should leaderboards be anonymous or show usernames?**
- **Pros (Anonymous):** Privacy-first, reduces competitive pressure
- **Cons (Anonymous):** Loses social proof, harder to build community
- **Current:** Usernames shown (opt-in to leaderboards in future?)
- **Owner:** Product Manager
- **Deadline:** February 1, 2026

**Q4: What's the minimum bet threshold for leaderboard eligibility?**
- **Current:** 10 settled bets
- **Concern:** Too low = gaming with lucky bets; too high = discourages new users
- **Data Needed:** Distribution of bets per user at 30 days
- **Owner:** Data Analyst
- **Deadline:** February 15, 2026

**Q5: Should we show bet stakes on public profiles?**
- **Pros:** Full transparency, helps users learn from others
- **Cons:** Privacy concerns, could enable "tailing" (copying bets)
- **Current:** Stakes hidden (only show BKS, outcome, selection)
- **Owner:** Product Manager + Legal
- **Deadline:** January 30, 2026

---

### Business Decisions

**Q6: When do we introduce monetization (premium subscription)?**
- **Risk:** Too early = poor conversion (feature set too basic)
- **Risk:** Too late = users expect free forever
- **Recommendation:** Phase 3 (Q3 2026) when analytics are robust enough to justify $9.99/month
- **Owner:** CEO
- **Deadline:** March 1, 2026

**Q7: Should we pursue sportsbook partnerships before or after 100k users?**
- **Leverage:** More users = stronger negotiating position
- **Risk:** Delay = competitors (FanDuel, DraftKings) build similar features in-house
- **Recommendation:** Soft outreach at 50k users, formal partnerships at 100k+
- **Owner:** Business Development
- **Deadline:** Ongoing

**Q8: How do we handle responsible gambling messaging?**
- **Current:** No real money = no legal requirement
- **Future:** If we add sportsbook integrations (bet import), do we need disclaimers?
- **Recommendation:** Proactively include "BKS measures skill, not gambling outcomes" messaging
- **Owner:** Legal + Product
- **Deadline:** February 28, 2026

---

### Design Decisions

**Q9: Should BKS scores be color-coded (red/yellow/green)?**
- **Pros:** Instant visual feedback on bet quality
- **Cons:** Could create anxiety ("My bet is red before the game even starts!")
- **Current:** Teal gradient (brand color, neutral)
- **Owner:** Design Lead
- **Deadline:** January 10, 2026

**Q10: How should we handle "beginner's luck" (user's first bet scores 95)?**
- **Risk:** Creates unrealistic expectations, discourages continued use when BKS normalizes
- **Recommendation:** Show educational tooltip: "Great score! Most users average 50-60 over time."
- **Owner:** Product Manager
- **Deadline:** January 25, 2026

---

## Appendix: Glossary

**American Odds:** Betting odds format (e.g., -110, +150) where negative = favorite, positive = underdog

**BKS (Ball Knowing Score):** Proprietary algorithm scoring betting skill 0-100

**CLV (Closing Line Value):** The difference between odds at bet placement vs. closing odds (market indicator of bet quality)

**De-vigging:** Removing bookmaker's margin (vig) to calculate fair probabilities

**Parlay:** Single bet combining multiple selections (all must win for payout)

**RLS (Row-Level Security):** Database-level access control (Supabase feature)

**SGP (Same-Game Parlay):** Parlay with all legs from the same game

**TTL (Time-To-Live):** Cache expiration time (e.g., Redis 60s TTL)

**WAU (Weekly Active Users):** Unique users active in a given week

---

**Document Change Log:**

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-12-28 | 1.0 | Initial PRD creation | Product Management |

---

*This PRD is a living document and will be updated as product decisions are finalized and features evolve.*
