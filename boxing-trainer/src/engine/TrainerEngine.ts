import * as Speech from 'expo-speech';
import {
  buildCalloutPool,
  generateCalloutTimestamps,
  getRoundStartCallout,
  restCallouts,
  timeWarnings,
  workoutCompleteCallout,
} from './callouts';
import { WorkoutConfig } from '../types';

type CalloutListener = (text: string) => void;

const SPEECH_RATE = 0.92;
const SPEECH_PITCH = 0.82;

export class TrainerEngine {
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private onCallout: CalloutListener;
  private config: WorkoutConfig;
  private calloutPool: string[] = [];
  private poolIndex = 0;

  constructor(config: WorkoutConfig, onCallout: CalloutListener) {
    this.config = config;
    this.onCallout = onCallout;
    this.calloutPool = buildCalloutPool(config.focusAreas);
  }

  private speak(text: string, delay = 0): void {
    const id = setTimeout(() => {
      this.onCallout(text);
      Speech.stop();
      Speech.speak(text, {
        rate: SPEECH_RATE,
        pitch: SPEECH_PITCH,
        language: 'en-US',
      });
    }, delay);
    this.timeouts.push(id);
  }

  private nextCallout(): string {
    const text = this.calloutPool[this.poolIndex % this.calloutPool.length];
    this.poolIndex++;
    // Reshuffle pool when we cycle through to avoid patterns
    if (this.poolIndex % this.calloutPool.length === 0) {
      this.calloutPool = buildCalloutPool(this.config.focusAreas);
    }
    return text;
  }

  announcePreCountdown(): void {
    this.speak("Get ready. Round one starts in ten seconds.");
  }

  // Called when the countdown finishes to fire the first round
  startRound(roundNum: number, durationSeconds: number): void {
    this.clearTimeouts();

    // Announce round start immediately
    const startCallout = getRoundStartCallout(roundNum);
    this.speak(startCallout);

    // Schedule focus callouts throughout the round
    const timestamps = generateCalloutTimestamps(durationSeconds, this.config.intensity);
    timestamps.forEach(ms => {
      this.speak(this.nextCallout(), ms);
    });

    // Time warnings
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

    // Announce rest start
    const startOptions = restCallouts.start;
    this.speak(startOptions[Math.floor(Math.random() * startOptions.length)]);

    if (isFinalRound) {
      this.speak(workoutCompleteCallout, 2500);
      return;
    }

    // Mid-rest encouragement
    if (restDurationSeconds > 25) {
      const midMs = Math.floor(restDurationSeconds / 2) * 1000;
      const midOptions = restCallouts.mid;
      this.speak(midOptions[Math.floor(Math.random() * midOptions.length)], midMs);
    }

    // 10-second warning before next round
    if (restDurationSeconds > 12) {
      const tenWarningMs = (restDurationSeconds - 10) * 1000;
      const tenOptions = restCallouts.tenSecWarning;
      this.speak(tenOptions[Math.floor(Math.random() * tenOptions.length)], tenWarningMs);
    }

    // 3-second countdown into next round
    if (restDurationSeconds > 4) {
      this.speak(restCallouts.countdown[0], (restDurationSeconds - 3) * 1000);
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
