// src/services/bks/calculator.ts

import { SPORT_CONFIGS, BKS_VERSION, COMPONENT_WEIGHTS } from '../../config/constants';
import { BetInput, BKSComponents, BKSResult } from './types';
import * as crypto from 'crypto';

export class BKSCalculator {
  private readonly version = BKS_VERSION;

  calculate(betData: BetInput): BKSResult {
    // Calculate all 6 components
    const components: BKSComponents = {
      difficulty: this.calculateDifficulty(betData),
      complexity: this.calculateComplexity(betData),
      payout: this.calculatePayout(betData),
      accuracy_clv: this.calculateCLV(betData),
      stake_significance: this.calculateStakeSignificance(betData),
      context_novelty: this.calculateContext(betData)
    };

    // Calculate base score
    const base = this.calculateBaseScore(components);

    // Calculate multiplier (provisional for now, final after settlement)
    const multiplier = this.calculateProvisionalMultiplier(betData);

    return {
      base_score: base,
      components,
      bks_provisional: base * multiplier,
      m_provisional: multiplier,
      signature: this.signBKS(betData.bet_id || 'temp', base)
    };
  }

  private calculateBaseScore(components: BKSComponents): number {
    const base = 100 * (
      COMPONENT_WEIGHTS.difficulty * components.difficulty +
      COMPONENT_WEIGHTS.complexity * components.complexity +
      COMPONENT_WEIGHTS.payout * components.payout +
      COMPONENT_WEIGHTS.accuracy_clv * components.accuracy_clv +
      COMPONENT_WEIGHTS.stake_significance * components.stake_significance +
      COMPONENT_WEIGHTS.context_novelty * components.context_novelty
    );

    return Math.min(100, Math.max(0, base));
  }

  // We'll implement each component calculator next
  private calculateDifficulty(betData: BetInput): number {
    // Real implementation based on v3.1.5
    const odds = betData.odds || -110;
    const decimal = this.americanToDecimal(odds);
    const fairProb = 1 / decimal; // Simplified - should remove vig
    return Math.min(1, -Math.log(fairProb) / -Math.log(0.01));
  }

  private calculateComplexity(betData: BetInput): number {
    // Implementation coming next
    return 0; // Placeholder
  }

  private calculatePayout(betData: BetInput): number {
    const odds = betData.odds || -110;
    const decimal = this.americanToDecimal(odds);
    const multiple = decimal - 1;
    return Math.min(1, Math.log(1 + multiple) / Math.log(21));
  }

  private americanToDecimal(odds: number): number {
    if (odds > 0) {
      return 1 + (odds / 100);
    } else {
      return 1 + (100 / Math.abs(odds));
    }
  }

  private calculateCLV(betData: BetInput): number {
    // Implementation coming next
    return 0.5; // Placeholder
  }

  private calculateStakeSignificance(betData: BetInput): number {
    // Implementation coming next
    return 0.5; // Placeholder
  }

  private calculateContext(betData: BetInput): number {
    // Implementation coming next
    return 0.5; // Placeholder
  }

  private calculateProvisionalMultiplier(betData: BetInput): number {
    // For pending bets, return neutral
    return 0.5;
  }

  private signBKS(betId: string, bks: number): string {
    const secret = process.env.BKS_SECRET || 'default-secret';
    const payload = {
      bet_id: betId,
      bks,
      timestamp: Date.now(),
      version: this.version
    };

    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private calculateTrueProbability(oddsSide: number, oddsOpposing: number): {side: number, opposing: number, vig: number} {
    const probSide = 1 / oddsSide;
    const probOpposing = 1 / oddsOpposing;
    const totalProb = probSide + probOpposing;

    return {
      side: probSide / totalProb,
      opposing: probOpposing / totalProb,
      vig: totalProb - 1
    };
  }
}
