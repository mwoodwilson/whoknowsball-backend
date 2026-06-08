import {
  mirrorForSouthpaw,
  buildCalloutPool,
  generateCalloutTimestamps,
} from '../src/engine/callouts';
import { WorkoutConfig } from '../src/types';

const baseConfig: WorkoutConfig = {
  rounds: 3,
  roundDuration: 180,
  restDuration: 60,
  focusAreas: ['combinations'],
  intensity: 'intermediate',
  stance: 'orthodox',
};

describe('mirrorForSouthpaw', () => {
  it('swaps left to right', () => {
    expect(mirrorForSouthpaw('Slip left.')).toBe('Slip right.');
  });

  it('swaps right to left', () => {
    expect(mirrorForSouthpaw('Circle right.')).toBe('Circle left.');
  });

  it('preserves case on capitalized words', () => {
    expect(mirrorForSouthpaw('Slip Left')).toBe('Slip Right');
  });

  it('handles both directions in one string', () => {
    const result = mirrorForSouthpaw('Slip left, slip right.');
    expect(result).toBe('Slip right, slip left.');
  });

  it('does not alter lead/rear', () => {
    const text = 'Lead shoulder up. Rear hand back.';
    expect(mirrorForSouthpaw(text)).toBe(text);
  });
});

describe('buildCalloutPool', () => {
  it('returns all five bank keys', () => {
    const pool = buildCalloutPool(baseConfig);
    expect(pool).toHaveProperty('combos');
    expect(pool).toHaveProperty('formCues');
    expect(pool).toHaveProperty('corrections');
    expect(pool).toHaveProperty('breathingCues');
    expect(pool).toHaveProperty('encouragement');
  });

  it('all banks are non-empty arrays', () => {
    const pool = buildCalloutPool(baseConfig);
    for (const key of Object.keys(pool) as (keyof typeof pool)[]) {
      expect(Array.isArray(pool[key])).toBe(true);
      expect(pool[key].length).toBeGreaterThan(0);
    }
  });

  it('southpaw pool mirrors directions in combos', () => {
    const orthodox = buildCalloutPool({ ...baseConfig, focusAreas: ['defense'], stance: 'orthodox' });
    const southpaw = buildCalloutPool({ ...baseConfig, focusAreas: ['defense'], stance: 'southpaw' });

    const orthodoxHasLeft = orthodox.combos.some(c => /\bleft\b/i.test(c));
    const southpawHasLeft = southpaw.combos.some(c => /\bleft\b/i.test(c));
    const southpawHasRight = southpaw.combos.some(c => /\bright\b/i.test(c));

    expect(orthodoxHasLeft).toBe(true);
    // southpaw should still have directional terms (mirrored), just flipped
    expect(southpawHasLeft || southpawHasRight).toBe(true);
  });
});

describe('generateCalloutTimestamps', () => {
  it('first callout is at 4000ms', () => {
    const schedule = generateCalloutTimestamps(180, 'intermediate');
    expect(schedule[0].ms).toBe(4000);
  });

  it('timestamps are sorted ascending', () => {
    const schedule = generateCalloutTimestamps(180, 'advanced');
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].ms).toBeGreaterThanOrEqual(schedule[i - 1].ms);
    }
  });

  it('advanced intensity produces more callouts than beginner for same duration', () => {
    const beginner = generateCalloutTimestamps(180, 'beginner');
    const advanced = generateCalloutTimestamps(180, 'advanced');
    expect(advanced.length).toBeGreaterThan(beginner.length);
  });

  it('all callout types are valid', () => {
    const valid = new Set(['combo', 'formCue', 'correction', 'breathing', 'encouragement']);
    const schedule = generateCalloutTimestamps(180, 'intermediate');
    for (const entry of schedule) {
      expect(valid.has(entry.type)).toBe(true);
    }
  });

  it('short duration produces no callouts past the safe window', () => {
    const schedule = generateCalloutTimestamps(60, 'beginner');
    const maxMs = (60 - 35) * 1000;
    for (const entry of schedule.filter(e => e.type === 'combo')) {
      if (entry.ms > 12000) { // past opening phase
        expect(entry.ms).toBeLessThanOrEqual(maxMs + 1);
      }
    }
  });
});
