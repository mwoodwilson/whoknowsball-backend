export type FocusArea =
  | 'jabs'
  | 'crosses'
  | 'hooks'
  | 'uppercuts'
  | 'combinations'
  | 'defense'
  | 'footwork'
  | 'bodyShots';

export type Intensity = 'beginner' | 'intermediate' | 'advanced';

export interface WorkoutConfig {
  rounds: number;
  roundDuration: number; // seconds
  restDuration: number; // seconds
  focusAreas: FocusArea[];
  intensity: Intensity;
}

export type WorkoutPhase = 'pre_countdown' | 'round' | 'rest' | 'complete';

export type RootStackParamList = {
  Setup: undefined;
  Workout: { config: WorkoutConfig };
  Complete: {
    roundsCompleted: number;
    totalWorkTime: number;
    config: WorkoutConfig;
  };
};
