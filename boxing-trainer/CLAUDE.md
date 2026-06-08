# Corner — Boxing Trainer App

Expo/React Native boxing training app. Calls out punch combinations via TTS throughout timed rounds. Fully offline, no accounts, no backend.

## Stack

- Expo SDK 53, React Native 0.76.9, TypeScript strict
- expo-speech (TTS), expo-haptics, expo-keep-awake, expo-audio
- React Navigation v6 native stack
- @react-native-async-storage/async-storage (local persistence only)
- @react-native-firebase (Crashlytics + Analytics — requires EAS build, not Expo Go)

## Commands

```bash
expo start          # development (Expo Go, no Firebase)
eas build --profile development --platform ios   # dev build with Firebase
eas build --profile production --platform ios    # App Store build
npm test            # run Jest smoke tests
```

## File Map

```
App.tsx                        navigator root, ErrorBoundary wrapper
src/
  types.ts                     WorkoutConfig, WorkoutSession, WorkoutPhase, RootStackParamList
  theme.ts                     colors, spacing, fontSize, radius tokens
  screens/
    SetupScreen.tsx            workout configuration + config persistence
    WorkoutScreen.tsx          live timer, TTS scheduling, keep-awake, AppState pause
    CompleteScreen.tsx         post-workout summary, saves session to history
    HistoryScreen.tsx          past sessions list from AsyncStorage
  engine/
    callouts.ts                callout pool builder, timestamp generator, southpaw mirror
    TrainerEngine.ts           TTS scheduler, round/rest lifecycle
  components/
    ErrorBoundary.tsx          React class boundary, recovery UI
  utils/
    storage.ts                 AsyncStorage wrapper (lastConfig + workoutHistory)
__tests__/
  callouts.test.ts             smoke tests for callout engine
__mocks__/
  expo-speech.js               Jest stub
  expo-haptics.js              Jest stub
```

## Callout System

`buildCalloutPool(config)` builds a `StructuredPool` with 5 typed banks (combos, formCues, corrections, breathingCues, encouragement). Banks are level-appropriate and shuffled each round. Southpaw configs get all directional terms (left/right) mirrored via `mirrorForSouthpaw`.

`generateCalloutTimestamps(durationSeconds, intensity)` schedules callouts in three phases:
- Opening (0–20s): first combo at 4s, form cue at 12s
- Main work (20s – end-35s): combos with weighted form/correction/breathing/encouragement interspersed
- Closing (last 35s): handled by fixed time warnings in TrainerEngine

`TrainerEngine` draws from the pool sequentially per type, preventing repeats until the bank cycles.

## Boxing Number System

1 = jab, 2 = cross, 3 = lead hook, 4 = rear hook, 5 = lead uppercut, 6 = rear uppercut. "b" suffix = body shot. Beginners: numbers only. Intermediate+: names and numbers mixed.

## Phase State Machine

`pre_countdown → round → rest → round → ... → complete`

Timer lives in a `setInterval` using refs to avoid stale closures. Phase transitions trigger TTS via TrainerEngine. AppState changes auto-pause the workout.

## App Store Setup (before submission)

1. Create Firebase project → add iOS app (bundle ID: `com.corner.boxingtrainer`) → download `GoogleService-Info.plist` → place in project root
2. Fill in `eas.json` submit config (appleId, ascAppId, appleTeamId)
3. Generate privacy policy via Termly/iubenda → update `app.json` extra.privacyPolicyUrl
4. Add privacy policy link in SetupScreen footer (Linking.openURL)
5. Create and export app icon (1024×1024), splash (2048×2048), adaptive-icon (1024×1024), favicon (48×48) → place in assets/
6. Source royalty-free boxing bell sound → save as assets/bell.mp3 → wire into WorkoutScreen via expo-audio

## Known Pending Items (P1)

- [ ] Firebase integration code (waiting on GoogleService-Info.plist from user)
- [ ] Boxing bell sounds (waiting on audio asset from user)
- [ ] Analytics events (workout_started, round_completed, workout_completed, workout_abandoned)
- [ ] Privacy policy link in-app (waiting on Termly URL)
