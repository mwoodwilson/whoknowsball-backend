import { OddsEnhancementService } from '../odds/OddsEnhancementService';
import { OddsAPIService } from '../odds/OddsAPIService';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';

export class ClosingOddsJob {
  private oddsEnhancer = OddsEnhancementService.getInstance();
  private oddsService = new OddsAPIService();

  async run() {
    try {
      // Query bets that are about to commence (within next 2 minutes)
      const now = new Date();
      const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

      const { data: bets, error } = await supabase
        .from('bets')
        .select('game_id, sport_key, commence_time, bookmaker')
        .eq('status', 'PENDING')
        .gte('commence_time', now.toISOString())
        .lte('commence_time', twoMinutesFromNow.toISOString());

      if (error) {
        console.error('Error querying bets for closing odds:', error);
        return;
      }

      if (!bets || bets.length === 0) {
        return;
      }

      // Group bets by sport_key to minimize API calls
      const sportGames = new Map<string, Set<string>>();
      for (const bet of bets) {
        if (!sportGames.has(bet.sport_key)) {
          sportGames.set(bet.sport_key, new Set());
        }
        sportGames.get(bet.sport_key)!.add(bet.game_id);
      }

      // Fetch odds for each sport
      for (const [sportKey, gameIds] of sportGames.entries()) {
        await this.captureClosingOddsForSport(sportKey, Array.from(gameIds));
      }
    } catch (error) {
      console.error('ClosingOddsJob error:', error);
    }
  }

  private async captureClosingOddsForSport(sportKey: string, gameIds: string[]) {
    try {
      // Fetch current odds from API
      const oddsData = await this.oddsService.fetchOdds(sportKey);

      // Filter to only the games we care about
      const relevantGames = oddsData.filter(game => gameIds.includes(game.id));

      for (const game of relevantGames) {
        for (const bookmaker of game.bookmakers) {
          // Prepare odds data
          const oddsSnapshot: any = {};
          for (const market of bookmaker.markets) {
            oddsSnapshot[market.key] = market.outcomes.map((outcome: any) => ({
              name: outcome.name,
              price: outcome.price,
              point: outcome.point
            }));
          }

          // Save closing odds to database
          await this.oddsEnhancer.captureClosingOdds(
            game.id,
            game.sport_key,
            bookmaker.key,
            oddsSnapshot,
            new Date(game.commence_time)
          );

          // Update bets table with closing odds
          await this.updateBetsWithClosingOdds(game.id, bookmaker.key, oddsSnapshot);
        }

        console.log(`✅ Captured closing odds for game ${game.id}`);
      }
    } catch (error) {
      console.error(`Error capturing closing odds for ${sportKey}:`, error);
    }
  }

  private async updateBetsWithClosingOdds(gameId: string, bookmaker: string, oddsData: any) {
    try {
      const { error } = await supabase
        .from('bets')
        .update({
          closing_odds_data: oddsData,
          closing_odds_captured_at: new Date().toISOString()
        })
        .eq('game_id', gameId)
        .eq('bookmaker', bookmaker)
        .eq('status', 'PENDING');

      if (error) {
        console.error('Error updating bets with closing odds:', error);
      }
    } catch (error) {
      console.error('Error in updateBetsWithClosingOdds:', error);
    }
  }
}

// Run every minute
setInterval(() => {
  const job = new ClosingOddsJob();
  job.run();
}, 60000);
