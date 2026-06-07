import * as Speech from 'expo-speech';
import {
  buildCalloutPool,
  generateCalloutTimestamps,
  getRoundOpener,
  restCallouts,
  timeWarnings,
  workoutCompleteCallout,
  StructuredPool,
  CalloutType,
} from './callouts';
import { WorkoutConfig } from '../types';

type CalloutListener = (text: string) => void;

const SPEECH_RATE = 0.92;
const SPEECH_PITCH = 0.82;

const poolBankKey: Record<CalloutType, keyof StructuredPool> = {
  combo: 'combos',
  formCue: 'formCues',
  correction: 'corrections',
  breathing: 'breathingCues',
  encouragement: 'encouragement',
};

export class TrainerEngine {
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private onCallout: CalloutListener;
  private config: WorkoutConfig;
  private pool: StructuredPool;
  private indices: Record<CalloutType, number> = {
    combo: 0,
    formCue: 0,
    correction: 0,
    breathing: 0,
    encouragement: 0,
  };

  constructor(config: WorkoutConfig, onCallout: CalloutListener) {
    this.config = config;
    this.onCallout = onCallout;
    this.pool = buildCalloutPool(config);
  }

  private speak(text: string, delayMs = 0): void {
    const id = setTimeout(() => {
      this.onCallout(text);
      Speech.stop();
      Speech.speak(text, {
        rate: SPEECH_RATE,
        pitch: SPEECH_PITCH,
        language: 'en-US',
      });
    }, delayMs);
    this.timeouts.push(id);
  }

  private draw(type: CalloutType): string {
    const bank = this.pool[poolBankKey[type]];
    const idx = this.indices[type] % bank.length;
    this.indices[type]++;
    return bank[idx];
  }

  private resetIndices(): void {
    this.indices = { combo: 0, formCue: 0, correction: 0, breathing: 0, encouragement: 0 };
  }

  announcePreCountdown(): void {
    this.speak('Get ready. Round one starts in ten seconds.');
  }

  startRound(roundNum: number, totalRounds: number, durationSeconds: number): void {
    this.clearTimeouts();
    // Reshuffle pool each round for variety
    this.pool = buildCalloutPool(this.config);
    this.resetIndices();

    // Round opener — announces the round's theme
    this.speak(getRoundOpener(roundNum, totalRounds, this.config.intensity));

    // Schedule all callouts throughout the round
    const schedule = generateCalloutTimestamps(durationSeconds, this.config.intensity);
    schedule.forEach(({ ms, type }) => {
      this.speak(this.draw(type), ms);
    });

    // Fixed time warnings
    if (durationSeconds > 65) {
      this.speak(timeWarnings.sixty, (durationSeconds - 60) * 1000);
    }
    if (durationSeconds > 35) {
      this.speak(timeWarnings.thirty, (durationSeconds - 30) * 1000);
    }
    if (durationSeconds > 12) {
      this.speak(timeWarnings.ten, (durationSeconds - 10) * 1000);
    }
  }

  startRest(restDurationSeconds: number, nextRoundNum: number, isFinalRound: boolean): void {
    this.clearTimeouts();

    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    this.speak(pick(restCallouts.start));

    if (isFinalRound) {
      this.speak(workoutCompleteCallout, 2500);
      return;
    }

    if (restDurationSeconds > 20) {
      // Mix general mid-rest and coaching notes
      const midBank = [...restCallouts.mid, ...restCallouts.coachingNotes];
      this.speak(pick(midBank), Math.floor(restDurationSeconds / 2) * 1000);
    }

    if (restDurationSeconds > 12) {
      this.speak(
        pick(restCallouts.tenSecWarning),
        (restDurationSeconds - 10) * 1000,
      );
    }

    if (restDurationSeconds > 4) {
      this.speak(restCallouts.countdown, (restDurationSeconds - 3) * 1000);
    }
  }

  stop(): void {
    this.clearTimeouts();
    Speech.stop();
  }

  private clearTimeouts(): void {
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
  }
}
