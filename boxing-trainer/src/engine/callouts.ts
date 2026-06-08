import { FocusArea, Intensity, WorkoutConfig } from '../types';

// ─── Southpaw mirror ──────────────────────────────────────────────────────────
// Swaps every occurrence of "left"/"right" (case-preserving).
// "Lead" / "rear" are stance-relative and intentionally left alone.

export const mirrorForSouthpaw = (text: string): string =>
  text.replace(/\b(left|right)\b/gi, (match) => {
    const isLeft = match.toLowerCase() === 'left';
    const result = isLeft ? 'right' : 'left';
    if (match === match.toUpperCase()) return result.toUpperCase();
    if (match[0] === match[0].toUpperCase())
      return result.charAt(0).toUpperCase() + result.slice(1);
    return result;
  });

// ─── Beginner combos — numbers only ──────────────────────────────────────────

const beginnerCombos: string[] = [
  'One!',
  'One-two!',
  'One, one, two!',
  'One-two-three!',
  'One-two-one.',
  'One. One. One-two.',
  'One, one, two-three.',
  'Two-three.',
  'One-six.',
  'One-two. Again.',
  'One-two-three. Again.',
  'One! Two! One-two!',
  'One, one. Double up.',
  'One-two. Reset. One-two.',
  'One-two-three. Pivot. One-two.',
];

// ─── Intermediate combos ──────────────────────────────────────────────────────

const intermediateCombos: string[] = [
  'One-two-three-two.',
  'Two-three-two.',
  'One, two to the body, three upstairs.',
  'One-three body-three. Level change.',
  'Two-five-three.',
  'Three-two-three.',
  'One-two-five-two-three.',
  'Six-three body-three.',
  'One, one, two-three-two.',
  'Two-three-two. Again.',
  'One-two-three-two. Go.',
  'Body, body, head. One, two body, three.',
  'One, two — level change — three.',
  'Two-three. Pivot. Two-three.',
];

// ─── Advanced combos ──────────────────────────────────────────────────────────

const advancedCombos: string[] = [
  'One-one-two-three body-three-two.',
  'Two-three-two-five-two.',
  'Three-five-three.',
  'Six-three body-three.',
  'One-two-one-two-three-two-one.',
  'One-one-two. Double up the three.',
  'Two-three-two. Fast. Again.',
  'Feint the one. Real two. Three.',
  'One-two, pause, one-two-three! Broken rhythm.',
  'Double feint — shoulder, one feint — real two.',
  'One-two-three-two-one. Full cycle.',
  'Three body-three-two. Off the same hand.',
];

// ─── Defensive integrated — written orthodox, mirror handles southpaw ─────────

const defensiveIntegrated: string[] = [
  'One-two — slip left — two-three.',
  'One-two — roll — three-two.',
  'One-two — pivot left — one-two.',
  'Slip left. Counter with the two.',
  'Throw, move your head, throw again.',
  'One-two-three — slip left — come back.',
  'After every combo — head movement.',
  'One-two — slip left — two-three — slip right.',
  'Roll under, come up with the three.',
  'Slip left, fire back. Slip right, fire back.',
  'One-two, step left, come back with the three.',
  'Pivot left off the cross. Fire from the angle.',
];

// ─── Advanced defensive integrated ────────────────────────────────────────────

const advancedDefensiveIntegrated: string[] = [
  'Slip left-one-two-roll-three-two-pivot.',
  'Pull back, counter with the two.',
  'Catch the jab, fire the two right behind it.',
  'Shoulder roll, fire two back along the same line.',
  'One-two, slip left, two-three, slip right. Keep going.',
  'Slip left, slip right, one-two-three. Go.',
];

// ─── Body-shot combos by level ────────────────────────────────────────────────

const bodyShotCombos: Record<Intensity, string[]> = {
  beginner: [
    'One-two to the body.',
    'Two to the body.',
    'One to the body. Two to the head.',
  ],
  intermediate: [
    'One, two to the body, three upstairs.',
    'One-three body-three. Level change.',
    'Body, body, head. Work the levels.',
    'Two to the body. Three to the head. Two.',
  ],
  advanced: [
    'Six-three body-three. Inside trap.',
    'Three body-three-two. Off the same hand.',
    'One-one-two-three body-three-two.',
    'Body shot, step back, one-two.',
    'Two body, three body, three head. Break them down.',
  ],
};

// ─── Footwork callouts — written orthodox ─────────────────────────────────────

const footworkCallouts: string[] = [
  'Circle left. Stay moving.',
  'Jab and step out. Don\'t stand there.',
  'Pivot left after — lead foot is your axis.',
  'In and out. In and out behind the jab.',
  'Step left. Cut the angle. Fire.',
  'Move your feet every time you throw.',
  'Don\'t back straight up — angle out to the left.',
  'Step-drag. Step-drag. Stay light.',
  'Pivot right off the exit. Change the angle.',
  'Circle right. Your weak side. Work it.',
];

// ─── Form cues ────────────────────────────────────────────────────────────────

const beginnerFormCues: string[] = [
  'Snap it back as fast as you threw it.',
  'Rear heel pivots on that two.',
  'Lead shoulder up — protect that chin.',
  'Return to guard. Every time.',
  'Stay on the balls of your feet.',
  'Exhale on every punch.',
  'Chin tucked. Eyes on the target.',
  'Don\'t arm-punch — rotate those hips.',
  'Short and sharp. Not big and slow.',
  'Fully retract before the next one.',
  'Wrist straight on impact.',
  'Land on the first two knuckles.',
];

const intermediateFormCues: string[] = [
  'Hip rotation drives the power.',
  'Set your feet to punch, then move.',
  'Lead foot is the axis. Pivot off it.',
  'Move your head before and after every combo.',
  'Load the cross off the hook\'s rotation.',
  'Don\'t square up on that hook.',
  'Elbow at fist height on the three.',
  'Short hook — from rotation, not a swing.',
  'Bend the knees on body shots. Not the back.',
  'Lead shoulder rolls up on the two.',
];

const advancedFormCues: string[] = [
  'Control the tempo. You set the rhythm.',
  'Feint first — then commit.',
  'Every combination has a reason.',
  'Pivot off the exit — create the angle.',
  'Break the rhythm. Don\'t be readable.',
  'Inside range — short and tight. No wind-ups.',
  'Eighty percent setup punches. Twenty percent power.',
];

// ─── Corrections (bad-habit callouts) ────────────────────────────────────────

export const corrections: string[] = [
  'Hands up! Rear hand back to the chin.',
  'Don\'t look down — eyes stay level.',
  'You\'re squaring up. Blade that stance.',
  'Stop leaning on it. Stay over your lead foot.',
  'You\'re telegraphing — don\'t drop before you throw.',
  'Chin down!',
  'Guard up after that combo.',
  'Don\'t push — snap it and retract.',
  'Rear hand! Keep it at the chin.',
  'Stop planting — move after every shot.',
  'Don\'t wind up. Short and compact.',
];

// ─── Breathing / relaxation ───────────────────────────────────────────────────

export const breathingCues: string[] = [
  'Breathe.',
  'Exhale on every punch.',
  'Stay relaxed. Don\'t tense up.',
  'Breathe through your nose.',
  'Loose shoulders. Stay loose.',
  'Breathe out when you throw.',
  'Relax. You\'re tight.',
];

// ─── Encouragement ────────────────────────────────────────────────────────────

export const encouragementCallouts: string[] = [
  'Good. Keep it going.',
  'That\'s the one. Repeat it.',
  'Good rhythm. Don\'t stop.',
  'Stay technical. That\'s how you do it.',
  'Good work. Keep the hands moving.',
  'Beautiful. Do it again.',
  'That\'s it. That\'s boxing.',
  'Good combinations. Keep the pace.',
  'Stay sharp. You\'re looking good.',
  'That\'s it. Strong.',
];

// ─── Time warnings ────────────────────────────────────────────────────────────

export const timeWarnings = {
  sixty: 'Sixty seconds!',
  thirty: 'Thirty seconds! Don\'t slow down.',
  ten: 'Ten seconds! Everything you\'ve got.',
};

// ─── Rest callouts ────────────────────────────────────────────────────────────

export const restCallouts = {
  start: [
    'Time. Good round. Rest.',
    'That\'s it. Breathe. Walk it out.',
    'Good work. Get your hands up and breathe.',
    'Time. Rest. Keep moving though.',
  ],
  mid: [
    'Keep moving. Don\'t stop completely.',
    'Good round. Stay focused.',
    'Breathe through your nose. Stay calm.',
    'Hands up even when you rest. Build the habit.',
    'Hydrate. Shake out the arms.',
  ],
  coachingNotes: [
    'Watch the guard on that hook — rear hand was dropping.',
    'Good combinations. Tighten the retract next round.',
    'Stay technical. Don\'t rush the combos.',
    'Good work. Stay sharp in the next one.',
    'Level changes — keep mixing body and head.',
  ],
  tenSecWarning: [
    'Ten seconds. Get ready.',
    'Get your hands up. Next round coming.',
    'Almost time. Stay focused.',
    'Ten seconds. Get loose.',
  ],
  countdown: 'Three... two... one...',
};

// ─── Round openers ────────────────────────────────────────────────────────────

export const getRoundOpener = (
  roundNum: number,
  totalRounds: number,
  intensity: Intensity,
): string => {
  const isLateRound = roundNum > Math.ceil(totalRounds / 2);

  const openers: Record<Intensity, Record<number, string>> = {
    beginner: {
      1: 'Round one. One-two only. Stay technical.',
      2: 'Round two. One-two-three. Focus on the retract.',
      3: 'Round three. Mix it. One-two and one-two-three.',
      4: 'Round four. Footwork. Jab every time you move.',
      5: 'Round five. Body shots. Drop levels — eyes stay up.',
      6: 'Round six. Freestyle. Anything from the session.',
    },
    intermediate: {
      1: 'Round one. Four-punch combos. One-two-three-two.',
      2: 'Round two. Slip-counter work. Throw, head moves, throw.',
      3: 'Round three. Level changes. Body and head.',
      4: 'Round four. Rhythm variation. Slow it down, then burst.',
      5: 'Round five. Inside work. Short and tight.',
      6: 'Round six. Put it all together.',
    },
    advanced: {
      1: 'Round one. Warm up at fight pace.',
      2: 'Round two. Pressure. Walk him down.',
      3: 'Round three. Counter-only. Wait for it.',
      4: 'Round four. Off the ropes. Slip, pivot, get out.',
      5: 'Round five. Broken rhythm. Own the tempo.',
      6: 'Round six. Body work. Break him down.',
    },
  };

  const map = openers[intensity];
  if (map[roundNum]) return map[roundNum];

  if (isLateRound) return `Round ${roundNum}. Championship rounds. Dig deep.`;
  return `Round ${roundNum}. Stay sharp. Keep the pace.`;
};

export const workoutCompleteCallout =
  "That's the session. Great work today. You put in the rounds — that's what matters.";

// ─── Focus area label ─────────────────────────────────────────────────────────

export const getFocusAreaLabel = (area: FocusArea): string => {
  const labels: Record<FocusArea, string> = {
    jabs: 'Jabs',
    crosses: 'Crosses',
    hooks: 'Hooks',
    uppercuts: 'Uppercuts',
    combinations: 'Combinations',
    defense: 'Defense',
    footwork: 'Footwork',
    bodyShots: 'Body Shots',
  };
  return labels[area];
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─── Structured pool ──────────────────────────────────────────────────────────

export interface StructuredPool {
  combos: string[];
  formCues: string[];
  corrections: string[];
  breathingCues: string[];
  encouragement: string[];
}

const buildCombosForConfig = (config: WorkoutConfig): string[] => {
  const { intensity, focusAreas } = config;
  const pool: string[] = [];

  // Level-appropriate base combos
  if (intensity === 'beginner') {
    pool.push(...beginnerCombos);
  } else if (intensity === 'intermediate') {
    pool.push(...beginnerCombos.slice(0, 5), ...intermediateCombos);
  } else {
    pool.push(...intermediateCombos.slice(0, 4), ...advancedCombos);
  }

  // Focus-area additions
  if (focusAreas.includes('bodyShots')) {
    pool.push(...bodyShotCombos[intensity]);
  }
  if (focusAreas.includes('footwork')) {
    pool.push(...footworkCallouts);
  }
  if (focusAreas.includes('defense')) {
    if (intensity !== 'beginner') pool.push(...defensiveIntegrated);
    if (intensity === 'advanced') pool.push(...advancedDefensiveIntegrated);
  }
  // Beginner defense = just form cues (no integrated combos yet)

  return shuffle(pool);
};

const buildFormCuesForLevel = (intensity: Intensity): string[] => {
  if (intensity === 'beginner') return shuffle(beginnerFormCues);
  if (intensity === 'intermediate')
    return shuffle([...beginnerFormCues.slice(0, 4), ...intermediateFormCues]);
  return shuffle([...intermediateFormCues.slice(0, 3), ...advancedFormCues]);
};

export const buildCalloutPool = (config: WorkoutConfig): StructuredPool => {
  const applyStance = config.stance === 'southpaw'
    ? mirrorForSouthpaw
    : (s: string) => s;
  return {
    combos: buildCombosForConfig(config).map(applyStance),
    formCues: buildFormCuesForLevel(config.intensity).map(applyStance),
    corrections: shuffle(corrections).map(applyStance),
    breathingCues: shuffle(breathingCues),
    encouragement: shuffle(encouragementCallouts),
  };
};

// ─── Scheduled callout type ───────────────────────────────────────────────────

export type CalloutType = 'combo' | 'formCue' | 'correction' | 'breathing' | 'encouragement';

export interface ScheduledCallout {
  ms: number;
  type: CalloutType;
}

// ─── Timestamp generation ─────────────────────────────────────────────────────
//
// Models the round as three phases:
//   Opening  (0–20s)        — first combo at 4s, form cue at 12s
//   Main work (20s–end-35s) — combos with form cues, corrections, breathing
//   Closing  (last 35s)     — handled by fixed time warnings in TrainerEngine

export const generateCalloutTimestamps = (
  durationSeconds: number,
  intensity: Intensity,
): ScheduledCallout[] => {
  const result: ScheduledCallout[] = [];

  const minInterval =
    intensity === 'beginner' ? 13000 : intensity === 'intermediate' ? 8000 : 5000;
  const maxInterval =
    intensity === 'beginner' ? 20000 : intensity === 'intermediate' ? 14000 : 10000;

  // Phase 1 — Opening
  result.push({ ms: 4000, type: 'combo' });
  if (durationSeconds > 18) result.push({ ms: 12000, type: 'formCue' });

  // Phase 2 — Main work
  const safeEnd = Math.max(20000, (durationSeconds - 35) * 1000);
  let cursor = 20000;
  let comboCount = 0;
  let lastFormCueMs = 12000;
  let lastCorrectionMs = -40000;
  let correctionsFired = 0;
  let breathingFired = false;
  let encouragementFired = false;

  while (cursor < safeEnd) {
    const interval = minInterval + Math.random() * (maxInterval - minInterval);

    // Form cue: every 3rd–4th combo and at least 20s since the last one
    if (comboCount > 0 && comboCount % 3 === 0 && cursor - lastFormCueMs > 20000) {
      result.push({ ms: cursor, type: 'formCue' });
      lastFormCueMs = cursor;
    }
    // Correction: ~20% chance, not back-to-back, max 2 per round
    else if (
      correctionsFired < 2 &&
      Math.random() < 0.20 &&
      cursor - lastCorrectionMs > 35000
    ) {
      result.push({ ms: cursor, type: 'correction' });
      lastCorrectionMs = cursor;
      correctionsFired++;
    }
    // Breathing cue: once, in the middle third of the round
    else if (
      !breathingFired &&
      cursor > durationSeconds * 400 &&
      cursor < durationSeconds * 650
    ) {
      result.push({ ms: cursor, type: 'breathing' });
      breathingFired = true;
    }
    // Encouragement: once, in the second half
    else if (
      !encouragementFired &&
      cursor > durationSeconds * 550 &&
      cursor < (durationSeconds - 40) * 1000
    ) {
      result.push({ ms: cursor, type: 'encouragement' });
      encouragementFired = true;
    }
    else {
      result.push({ ms: cursor, type: 'combo' });
      comboCount++;
    }

    cursor += interval;
  }

  return result.sort((a, b) => a.ms - b.ms);
};
