# Ball Knowing Score (BKS) Algorithm

**Version:** 3.4.0
**License:** MIT

BKS is an open scoring algorithm that quantifies sports betting **skill** on a 0–100 scale. Rather than just tracking wins and losses, BKS evaluates the quality of each bet across six dimensions — rewarding sophisticated decision-making and penalizing lucky flukes.

---

## Table of Contents

1. [Core Philosophy](#1-core-philosophy)
2. [Master Formula](#2-master-formula)
3. [Base Score Components](#3-base-score-components)
   - [D — Difficulty (45%)](#d--difficulty-45)
   - [C — Complexity (18%)](#c--complexity-18)
   - [P — Payout Conviction (13%)](#p--payout-conviction-13)
   - [A — Accuracy / Closing Line Value (10%)](#a--accuracy--closing-line-value-10)
   - [S — Stake Significance (10%)](#s--stake-significance-10)
   - [K — Context (4%)](#k--context-4)
4. [Outcome Multiplier (M)](#4-outcome-multiplier-m)
5. [Worked Examples](#5-worked-examples)
6. [Design Invariants](#6-design-invariants)
7. [Quick Reference](#7-quick-reference)

---

## 1. Core Philosophy

Most betting metrics reward luck. BKS rewards skill.

A great bet that loses still earns a meaningful score. A terrible bet that wins is penalized. The algorithm evaluates what you could control (bet selection, timing, stake sizing) separately from what you couldn't (the outcome).

**Key design decisions:**

- **Separation of concerns** — The base score captures pre-result bet quality. The outcome multiplier captures the result. These never overlap.
- **No double-counting** — Closing Line Value lives only in the base score. Result margin lives only in the multiplier.
- **Anti-gaming** — Easy bets are capped so you can't inflate your score by hammering heavy favorites with large stakes.
- **Graceful degradation** — Missing data (no closing odds, unknown context) falls back to neutral values rather than failing.

---

## 2. Master Formula

```
BKS = Base × M
```

| Variable | Range | Description |
|----------|-------|-------------|
| **Base** | [0, 100] | Quality of the bet before the result |
| **M** | [0.0, 1.0] | Outcome multiplier — scales based on result |

**The base formula:**

```
Base = 100 × (0.45·D + 0.18·C + 0.13·P + 0.10·A + 0.10·S + 0.04·K)
```

---

## 3. Base Score Components

### D — Difficulty (45%)

> *How hard was this bet to win?*

Difficulty is the most heavily weighted component. It measures the true implied probability of the bet using **de-vigged fair odds** — the bookmaker's margin is removed before calculating how hard the bet was.

```
D = 1 - fair_probability
```

A bet with a 60% fair win probability has `D = 0.40`. A bet with a 25% fair win probability has `D = 0.75`.

**Converting American odds to fair probability:**

Step 1 — Convert to decimal odds:
```
odds > 0:  decimal = 1 + (odds / 100)     // +150 → 2.50
odds < 0:  decimal = 1 + (100 / |odds|)   // -150 → 1.667
```

Step 2 — De-vig (2-way market):
```
rawProb     = 1 / decimal_odds
rawOpposing = 1 / decimal_odds_opposing
fairProb    = rawProb / (rawProb + rawOpposing)
D           = 1 - fairProb
```

Step 3 — De-vig (3-way market — e.g. soccer with draw):
```
pHome = 1 / decimal_home
pDraw = 1 / decimal_draw
pAway = 1 / decimal_away
total = pHome + pDraw + pAway

fairHome = pHome / total
fairDraw = pDraw / total
fairAway = pAway / total
```

**For parlays**, multiply the fair probabilities of each leg:
```
combinedProb = leg1_fairProb × leg2_fairProb × ... × legN_fairProb
D = 1 - combinedProb
```

**Reference table:**

| Odds | Fair Prob | D |
|------|-----------|---|
| -300 | 0.75 | 0.25 |
| -150 | 0.60 | 0.40 |
| -110 | 0.52 | 0.48 |
| +110 | 0.48 | 0.52 |
| +150 | 0.40 | 0.60 |
| +300 | 0.25 | 0.75 |

---

### C — Complexity (18%)

> *How sophisticated was the bet construction?*

Complexity rewards multi-leg parlays, with a penalty for correlated legs (e.g. same-game parlays where legs aren't truly independent).

```
L = min(number_of_legs, 12)
ρ = correlation factor  // 0 = fully independent, 1 = fully correlated

C = min((L - 1) × 0.3, 0.9) × (1 - 0.5 × ρ)
```

Single bets always return `C = 0`.

**Complexity by leg count:**

| Legs | ρ = 0 (independent) | ρ = 0.5 (moderate) | ρ = 1.0 (fully correlated) |
|------|---------------------|---------------------|---------------------------|
| 1 | 0.00 | 0.00 | 0.00 |
| 2 | 0.30 | 0.23 | 0.15 |
| 3 | 0.60 | 0.45 | 0.30 |
| 4+ | 0.90 | 0.68 | 0.45 |

---

### P — Payout Conviction (13%)

> *Did you put your money where your mouth was?*

Payout rewards both the odds you took and the confidence you showed through stake size. A high-odds bet with a large stake signals genuine conviction — and scores higher than the same bet with a tiny stake.

```
PM    = decimal_odds - 1                         // payout multiple
SF    = log₁₀(stake + 9) / log₁₀(10009)         // stake factor [0, 1]
CM    = 1.0 + (10.0 × SF)                        // conviction multiplier
P_max = 1.0 + (D × 2.0)                          // difficulty-scaled ceiling
P     = clamp((PM / 10) × CM, 0, P_max)
```

**Why a difficulty-scaled ceiling?**
Without it, someone could bet -500 (a massive favorite) with a huge stake and inflate their score. `P_max` is lower for easy bets, preventing this.

**Conviction multiplier by stake:**

| Stake | CM |
|-------|----|
| $10 | ~4.2 |
| $50 | ~5.3 |
| $100 | ~6.1 |
| $500 | ~7.7 |
| $1,000 | ~8.5 |
| $10,000 | 11.0 |

**Maximum P allowed by difficulty:**

| D | P_max |
|---|-------|
| 0.25 (easy) | 1.50 |
| 0.50 (medium) | 2.00 |
| 0.75 (hard) | 2.50 |
| 0.90 (very hard) | 2.80 |

---

### A — Accuracy / Closing Line Value (10%)

> *Did you beat the market?*

Closing Line Value (CLV) measures whether you got a better price than the market settled on. If you bet +150 and the line closed at +120, you got the better number — a sign of genuine market edge.

```
pOpen  = devig(odds_open, odds_open_opposing)
pClose = devig(odds_close, odds_close_opposing)

logOddsOpen  = ln(pOpen / (1 - pOpen))
logOddsClose = ln(pClose / (1 - pClose))

clvRaw  = logOddsClose - logOddsOpen
clamped = clamp(clvRaw, -0.15, +0.15)
A       = (clamped + 0.15) / 0.3             // normalized to [0, 1]
```

If closing odds are unavailable, `A = 0.5` (neutral — no bonus or penalty).

**CLV score interpretation:**

| Raw CLV | A Score | Meaning |
|---------|---------|---------|
| +0.15 | 1.00 | Best possible — line moved significantly in your favor |
| +0.05 | 0.67 | Good timing |
| 0.00 | 0.50 | Neutral — line didn't move |
| -0.05 | 0.33 | Bad timing — line moved against you |
| -0.15 | 0.00 | Worst — you faded the smart money |

---

### S — Stake Significance (10%)

> *Did this bet matter to you?*

Stake rewards the size of the bet relative to a reference bankroll, using logarithmic scaling so that doubling your stake doesn't double your score — diminishing returns apply.

```
S = log₁₀(stake + 9) / log₁₀(10009)
```

**Reference values:**

| Stake | S |
|-------|---|
| $1 | 0.25 |
| $10 | 0.32 |
| $50 | 0.43 |
| $100 | 0.51 |
| $500 | 0.67 |
| $1,000 | 0.75 |
| $5,000 | 0.92 |
| $10,000 | 1.00 |

---

### K — Context (4%)

> *Did the game matter?*

A playoff bet shows more conviction than a preseason one. Context applies a small bonus for high-stakes games.

```
K = context_map[game_context]
```

| Context | K |
|---------|---|
| Preseason | 0.20 |
| Regular season | 0.40 |
| Playoffs | 0.70 |
| Finals / Championship | 1.00 |

Default (unknown): `0.40`

---

## 4. Outcome Multiplier (M)

The outcome multiplier is applied after the base score is calculated. It scales the final BKS based on whether the bet won or lost — and by how much.

**M is the only place where the game result appears.** It never touches the base score.

### Multiplier ranges

| Outcome | M Range | Formula |
|---------|---------|---------|
| **WIN** | [0.60, 1.00] | `0.60 + 0.40 × clamp(z/3, 0, 1)` |
| **LOSS** | [0.10, 0.50] | `0.10 + 0.40 × (1 − clamp(|z|/3, 0, 1))` |
| **PUSH** | 0.55 | Fixed |
| **VOID** | 0.50 | Fixed |
| **PENDING** | [0.50, 0.95] | `0.50 + D × 0.45` |

Where:
```
z = cover_margin / σ
```

`cover_margin` is how much you won/lost by relative to the line. `σ` is the sport's typical scoring variance.

### Sport variance (σ)

| Sport | σ |
|-------|---|
| NFL | 1.5 |
| NBA | 1.0 |
| MLB | 0.7 |
| NHL | 0.6 |
| Soccer | 0.5 |

### WIN multiplier in practice

A narrow NFL win (1 point) gives `z ≈ 0.67 → M = 0.69`. A blowout (14+ points) gives `z ≥ 3 → M = 1.00`.

### LOSS multiplier in practice

A close NBA loss (1 point) gives `z ≈ 1.0 → M = 0.37`. A blowout (15+ points) gives `z ≥ 3 → M = 0.10`.

### PENDING (pre-game) multiplier

Before a game starts, BKS is provisional. Harder bets get higher provisional scores because the risk is real:

```
M_pending = 0.50 + (D × 0.45)
```

| D | M_pending |
|---|-----------|
| 0.25 | 0.61 |
| 0.50 | 0.73 |
| 0.75 | 0.84 |
| 0.90 | 0.91 |

### Parlay loss multiplier

For parlays where individual leg outcomes are tracked:

| Result | M | Notes |
|--------|---|-------|
| 0 legs hit | **0** | BKS = 0 — no credit for a total miss |
| 1+ legs hit | `(hits/total) × (avg_hit_difficulty × 0.50)` | Range [0.05, 0.45] |

More legs hit, and harder legs hit, both increase M.

---

## 5. Worked Examples

### Example 1 — Single moneyline win (NFL, -150, $100 stake)

```
Inputs:
  Odds: -150 (fair prob ≈ 0.60, opposing: +130)
  Stake: $100
  Context: Regular season
  CLV: line moved +0.05 log-odds in your favor
  Outcome: Won by 7 points

D = 1 - 0.60 = 0.40
C = 0  (single bet)
P = clamp((0.667/10) × 6.1, 0, 1 + 0.40×2) = clamp(0.41, 0, 1.80) = 0.41
A = (0.05 + 0.15) / 0.3 = 0.67
S = log₁₀(109) / log₁₀(10009) = 0.51
K = 0.40

Base = 100 × (0.45×0.40 + 0.18×0 + 0.13×0.41 + 0.10×0.67 + 0.10×0.51 + 0.04×0.40)
     = 100 × 0.367
     = 36.7

z = 7 / 1.5 = 4.67  →  clamp(4.67/3, 0, 1) = 1.0
M = 0.60 + 0.40 × 1.0 = 1.00

BKS = 36.7 × 1.00 = 36.7
```

---

### Example 2 — 3-leg parlay, 2/3 legs hit (+650, $50 stake)

```
Inputs:
  3 uncorrelated legs, combined odds +650 (fair prob ≈ 0.13)
  Stake: $50
  Outcome: 2 legs won, 1 lost by 1 point

D = 1 - 0.13 = 0.87
C = min((3-1)×0.3, 0.9) × (1 - 0.5×0) = 0.60
P = clamp((6.5/10) × 5.3, 0, 1 + 0.87×2) = clamp(3.45, 0, 2.74) = 2.74
A = 0.50  (no closing odds available)
S = log₁₀(59) / log₁₀(10009) = 0.43
K = 0.40

Base = 100 × (0.45×0.87 + 0.18×0.60 + 0.13×2.74 + 0.10×0.50 + 0.10×0.43 + 0.04×0.40)
     = 100 × 0.965
     = 96.5  →  capped at 100

M = (2/3) × (avg_hit_difficulty × 0.50) ≈ 0.37  (partial parlay loss)

BKS = 96.5 × 0.37 = 35.7
```

---

### Example 3 — Heavy favorite, single bet, loss (-300, $200 stake, NFL blowout)

```
D = 1 - 0.75 = 0.25   (easy bet)
C = 0
P = clamp((0.333/10) × 6.8, 0, 1.50) = 0.23
A = 0.50  (neutral)
S = 0.55
K = 0.40

Base = 100 × (0.45×0.25 + 0 + 0.13×0.23 + 0.10×0.50 + 0.10×0.55 + 0.04×0.40)
     = 100 × 0.242
     = 24.2

Lost by 14 pts: z = 14/1.5 = 9.33 → clamped at 3
M = 0.10 + 0.40 × (1 - 1.0) = 0.10

BKS = 24.2 × 0.10 = 2.4
```

---

## 6. Design Invariants

These must hold for every BKS calculation:

| # | Invariant |
|---|-----------|
| 1 | Win BKS ≥ Loss BKS for the same base score |
| 2 | All components D, C, P, A, S, K ∈ [0, 1] |
| 3 | Final BKS ∈ [0, 100] |
| 4 | P ≤ P_max where P_max = 1 + (D × 2) |
| 5 | CLV appears only in A; result margin appears only in M |
| 6 | State transitions are one-directional: PENDING → LIVE → SETTLED |

---

## 7. Quick Reference

### Full formula recap

```
BKS = Base × M

Base = 100 × (0.45·D + 0.18·C + 0.13·P + 0.10·A + 0.10·S + 0.04·K)

D     = 1 - devig(odds, opposing_odds)
C     = min((legs - 1) × 0.3, 0.9) × (1 - 0.5 × correlation)
P     = clamp((PM/10) × CM, 0, 1 + D×2)
        where PM = decimal_odds - 1
              CM = 1 + 10 × (log₁₀(stake+9) / log₁₀(10009))
A     = clamp(logOddsClose - logOddsOpen, -0.15, +0.15) mapped to [0,1]
S     = log₁₀(stake + 9) / log₁₀(10009)
K     = { preseason: 0.2, regular: 0.4, playoffs: 0.7, finals: 1.0 }

M (WIN)     = 0.60 + 0.40 × clamp(z/3, 0, 1)
M (LOSS)    = 0.10 + 0.40 × (1 - clamp(|z|/3, 0, 1))
M (PUSH)    = 0.55
M (VOID)    = 0.50
M (PENDING) = 0.50 + D × 0.45

z = cover_margin / σ
σ = { NFL: 1.5, NBA: 1.0, MLB: 0.7, NHL: 0.6, Soccer: 0.5 }
```

### What makes a high BKS?

- Taking **hard bets** at long odds (high D)
- Building **multi-leg parlays** of independent legs (high C)
- Betting with **conviction** — larger stakes on bigger odds (high P)
- **Beating the closing line** — getting a better number than the market settled (high A)
- **Winning convincingly** — covering by a large margin (high M)

### What tanks your BKS?

- Hammering **heavy favorites** (low D, capped P)
- Betting **same-game parlays** with correlated legs (correlation penalty on C)
- Fading the market — **line moves against you** (low A)
- **Losing badly** — getting blown out (low M, close to 0.10)
- Parlays where **no legs hit** (M = 0, BKS = 0)

---

*BKS Algorithm v3.4.0 — Released under MIT License*
