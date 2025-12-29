import { redis } from '../../config/redis';
import { supabase } from '../../config/supabase';

export class OddsEnhancementService {
  private static instance: OddsEnhancementService;

  static getInstance(): OddsEnhancementService {
    if (!this.instance) {
      this.instance = new OddsEnhancementService();
    }
    return this.instance;
  }

  async captureOpeningOdds(gameId: string, sportKey: string, bookmaker: string, oddsData: any) {
    try {
      const cacheKey = `opening:${gameId}:${bookmaker}`;
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const { data: existing } = await supabase
        .from('opening_odds')
        .select('*')
        .eq('game_id', gameId)
        .eq('bookmaker', bookmaker)
        .single();

      if (existing) return existing.odds_data;

      const openingData = {
        game_id: gameId,
        sport_key: sportKey,
        bookmaker: bookmaker,
        market_type: 'all',
        odds_data: oddsData,
      };

      const { data, error } = await supabase
        .from('opening_odds')
        .insert(openingData)
        .select()
        .single();

      if (error) throw error;
      await redis.set(cacheKey, JSON.stringify(oddsData), 'EX', 86400);

      return oddsData;
    } catch (error) {
      console.error('Error capturing opening odds:', error);
      return null;
    }
  }

  async captureClosingOdds(gameId: string, sportKey: string, bookmaker: string, oddsData: any, commenceTime: Date) {
    try {
      const closingData = {
        game_id: gameId,
        sport_key: sportKey,
        bookmaker: bookmaker,
        market_type: 'all',
        odds_data: oddsData,
        commence_time: commenceTime,
      };

      const { data, error } = await supabase
        .from('closing_odds')
        .insert(closingData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error capturing closing odds:', error);
      return null;
    }
  }

  getGameContext(sportKey: string, date: Date): string {
    const month = date.getMonth();

    if (sportKey.includes('nfl')) {
      if (month === 0) return 'playoffs';
      if (month === 1 && date.getDate() < 15) return 'finals';
      if (month >= 8 || month <= 1) return 'regular';
      return 'preseason';
    }

    if (sportKey.includes('nba')) {
      if (month >= 3 && month <= 5) return 'playoffs';
      if (month === 5 && date.getDate() > 10) return 'finals';
      if (month >= 9 || month <= 3) return 'regular';
      return 'preseason';
    }

    if (sportKey.includes('mlb')) {
      if (month === 9) return 'playoffs';
      if (month === 9 && date.getDate() > 20) return 'finals';
      if (month >= 3 && month <= 8) return 'regular';
      return 'preseason';
    }

    return 'regular';
  }

  async scheduleClosingOddsCapture(gameId: string, commenceTime: string) {
    const captureTime = new Date(commenceTime).getTime() - (2 * 60 * 1000);
    const now = Date.now();

    if (captureTime > now) {
      await redis.zadd('closing_odds_schedule', captureTime, gameId);
      console.log(`Scheduled closing odds capture for game ${gameId}`);
    }
  }
}
