# Corner — Boxing Trainer

A mobile boxing trainer that acts as your corner man. Set up your rounds, pick your focus, and Corner will call out punches, combinations, and encouragement with an actual voice — mimicking the cadence of a real trainer.

## Features

- **Configurable rounds** — 1 to 12 rounds, 1–5 min each, custom rest time
- **Focus areas** — Jabs, Crosses, Hooks, Uppercuts, Combinations, Defense, Footwork, Body Shots
- **Trainer intensity** — Beginner (slow pace, simple combos) / Intermediate / Advanced (rapid-fire)
- **Live voice callouts** — native TTS engine calls combinations with a trainer's cadence
- **Time warnings** — automatic "Thirty seconds!", "Ten seconds!" callouts
- **Haptic feedback** — round transitions confirmed by vibration
- **Clean dark UI** — built for glance-ability mid-workout

## Tech Stack

- **Expo SDK 53** — React Native + Expo managed workflow
- **expo-speech** — native TTS (iOS AVSpeechSynthesizer / Android TextToSpeech)
- **React Navigation v6** — native stack navigation
- **expo-haptics** — round-change vibration feedback
- **TypeScript** — strict mode throughout

## Quick Start

```bash
cd boxing-trainer
npm install
npx expo start
```

Scan the QR code with **Expo Go** on iOS or Android.

For a native build:
```bash
npx expo run:ios     # requires Xcode
npx expo run:android # requires Android Studio
```

### Production build (EAS)

```bash
npm install -g eas-cli
eas login
eas build --platform ios     # signed .ipa
eas build --platform android # signed .aab
```

## App Store Readiness Checklist

Based on the research report this app was built from:

- [x] No hardcoded secrets (app is fully local, no API keys)
- [x] Gesture back disabled on workout screen (prevents accidental exit)
- [x] Confirmation dialog before stopping an active workout
- [x] Works fully offline (speech uses on-device TTS)
- [ ] Add `expo-tracking-transparency` + `NSUserTrackingUsageDescription` before adding analytics
- [ ] Add privacy policy URL to `app.json` before App Store submission
- [ ] Add `PrivacyInfo.xcprivacy` manifest via `expo-build-properties` for iOS 17+
- [ ] Add Sign in with Apple if you add user accounts (Guideline 4.8)
- [ ] Add RevenueCat if you add subscriptions (not Stripe for in-app digital goods)
- [ ] Configure EAS or Codemagic for automated signing before release

## File Structure

```
boxing-trainer/
  App.tsx                    — navigation root
  src/
    types.ts                 — shared TypeScript types
    theme.ts                 — colors, spacing, typography
    engine/
      callouts.ts            — all trainer dialogue, callout pools, timing logic
      TrainerEngine.ts       — schedules speech throughout a round/rest period
    screens/
      SetupScreen.tsx        — configure rounds, focus, intensity
      WorkoutScreen.tsx      — the main workout UI + timer state machine
      CompleteScreen.tsx     — post-workout summary
```

## Extending

**Add new focus areas:** add entries to `FocusArea` in `types.ts`, add callouts to `callouts.ts`, add label/icon in `SetupScreen.tsx`.

**Add a bell sound:** install `expo-av`, drop a `bell.mp3` in `assets/`, and play it in `TrainerEngine` at round start/end alongside the voice callout.

**Add persistence:** `@react-native-async-storage/async-storage` is already in `package.json` — save `WorkoutConfig` as the user's last-used settings on setup screen.

**Add workout history:** store completed workouts in AsyncStorage (or Supabase if you add auth).
