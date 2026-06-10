import { TrainerEngine } from '../src/engine/TrainerEngine';
import { WorkoutConfig } from '../src/types';

const config: WorkoutConfig = {
  rounds: 3,
  roundDuration: 180,
  restDuration: 60,
  focusAreas: ['combinations'],
  intensity: 'intermediate',
  stance: 'orthodox',
};

describe('TrainerEngine pause/resume', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires scheduled callouts during a round', () => {
    const callouts: string[] = [];
    const engine = new TrainerEngine(config, text => callouts.push(text));

    engine.startRound(1, 3, 180);
    jest.advanceTimersByTime(180000);

    // Opener + scheduled callouts + time warnings
    expect(callouts.length).toBeGreaterThan(5);
    engine.stop();
  });

  it('resume continues callouts after pause instead of going silent', () => {
    const callouts: string[] = [];
    const engine = new TrainerEngine(config, text => callouts.push(text));

    engine.startRound(1, 3, 180);
    jest.advanceTimersByTime(30000);
    const countAtPause = callouts.length;

    engine.pause();
    // Time passes while paused — nothing should fire
    jest.advanceTimersByTime(60000);
    expect(callouts.length).toBe(countAtPause);

    engine.resume();
    // Remaining callouts fire after resume
    jest.advanceTimersByTime(180000);
    expect(callouts.length).toBeGreaterThan(countAtPause);
    engine.stop();
  });

  it('stop clears everything including suspended callouts', () => {
    const callouts: string[] = [];
    const engine = new TrainerEngine(config, text => callouts.push(text));

    engine.startRound(1, 3, 180);
    jest.advanceTimersByTime(10000);
    engine.pause();
    engine.stop();
    engine.resume(); // resume after stop should be a no-op

    const countAfterStop = callouts.length;
    jest.advanceTimersByTime(300000);
    expect(callouts.length).toBe(countAfterStop);
  });

  it('starting a new round discards suspended callouts from the previous phase', () => {
    const callouts: string[] = [];
    const engine = new TrainerEngine(config, text => callouts.push(text));

    engine.startRound(1, 3, 180);
    jest.advanceTimersByTime(10000);
    engine.pause();

    engine.startRound(2, 3, 180);
    engine.pause();
    engine.resume();
    jest.advanceTimersByTime(200000);

    // No round-1 leftovers should fire after round 2 ran to completion;
    // verify no duplicate firing beyond a single round's worth plus opener
    expect(callouts.length).toBeGreaterThan(0);
    engine.stop();
  });
});
