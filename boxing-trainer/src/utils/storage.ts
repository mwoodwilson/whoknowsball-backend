import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutConfig, WorkoutSession } from '../types';

const KEYS = {
  lastConfig: '@corner/lastConfig',
  workoutHistory: '@corner/workoutHistory',
} as const;

export async function saveLastConfig(config: WorkoutConfig): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastConfig, JSON.stringify(config));
}

export async function loadLastConfig(): Promise<WorkoutConfig | null> {
  const raw = await AsyncStorage.getItem(KEYS.lastConfig);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkoutConfig;
  } catch {
    return null;
  }
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  const existing = await loadWorkoutHistory();
  const updated = [session, ...existing].slice(0, 100); // cap at 100 entries
  await AsyncStorage.setItem(KEYS.workoutHistory, JSON.stringify(updated));
}

export async function loadWorkoutHistory(): Promise<WorkoutSession[]> {
  const raw = await AsyncStorage.getItem(KEYS.workoutHistory);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WorkoutSession[];
  } catch {
    return [];
  }
}
