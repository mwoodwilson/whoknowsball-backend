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

export type Stance = 'orthodox' | 'southpaw';

export interface WorkoutConfig {
  rounds: number;
  roundDuration: number; // seconds
  restDuration: number; // seconds
  focusAreas: FocusArea[];
  intensity: Intensity;
  stance: Stance;
}

export type WorkoutPhase = 'pre_countdown' | 'round' | 'rest' | 'complete';

export interface WorkoutSession {
  id: string;
  date: string; // ISO string
  roundsCompleted: number;
  totalWorkTime: number; // seconds
  config: WorkoutConfig;
}

export type RootStackParamList = {
  Setup: undefined;
  Workout: { config: WorkoutConfig };
  Complete: {
    roundsCompleted: number;
    totalWorkTime: number;
    config: WorkoutConfig;
  };
  History: undefined;
};
