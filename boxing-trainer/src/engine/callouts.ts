import { FocusArea, Intensity } from '../types';

// ─── Callout Banks ───────────────────────────────────────────────────────────

const jabCallouts = [
  'Jab! Jab! Double jab!',
  'Keep that jab in his face!',
  'Jab to the body, jab to the head!',
  'Snap that jab back! Hands up!',
  'Triple jab, come on!',
  'Use that jab to set everything up!',
  'Jab every time you move!',
  'Flick it! Quick jab, quick jab!',
  'Don\'t cock it back — flick that jab!',
  'Jab, move, jab, move!',
  'That\'s it! Jab all day!',
  'Stay behind the jab!',
  'Paw that jab out there!',
];

const crossCallouts = [
  'Jab, cross! One, two!',
  'Snap that right hand!',
  'Rotate — turn your hip into it!',
  'One, two! One, two! Keep the pace!',
  'Throw that cross with conviction!',
  'Jab, cross, move! Don\'t stand flat-footed!',
  'Power on that two! Drive through it!',
  'One, two — step off the line after!',
  'Shoulder up on that cross!',
  'Pivot out after the two! Good!',
  'Straight right hand! Down the pipe!',
];

const hookCallouts = [
  'Left hook! Dig it in!',
  'One, two, three! Jab, cross, hook!',
  'Hook to the body, hook to the head!',
  'Turn that hook over! Elbow parallel!',
  'Short hook! Keep it tight!',
  'One, two, three — pivot after the hook!',
  'Load that hook from the hip!',
  'Hook, roll, hook! Don\'t stop!',
  'Body hook! Bend your knees and dig!',
  'Switch up — right hook! Come on!',
  'Compact hook — not a haymaker!',
];

const uppercutCallouts = [
  'Uppercut! Dig deep!',
  'Left uppercut, right uppercut!',
  'One, two, uppercut! Drive up through it!',
  'Jab, cross, left hook, right uppercut!',
  'Dip and uppercut! Use your legs!',
  'Short uppercut — split the guard!',
  'Body shot, uppercut, uppercut!',
  'Rip those uppercuts! Don\'t stop!',
  'Bend the knees, explode up!',
  'Inside — uppercut to the chin!',
];

const combinationCallouts = [
  'One, two, three! Jab, cross, hook!',
  'One, two, three, four! Don\'t stop!',
  'Double jab, cross, hook! Move!',
  'One, two — double up the hook!',
  'Jab, cross, left hook, right hand!',
  'One, one, two! One, one, two!',
  'Body, body, head! Switch levels!',
  'Throw fours! Four-punch combinations!',
  'Three-punch combo, step off the line!',
  'Switch it up — don\'t be predictable!',
  'One, two, three, two! Come on!',
  'Jab, slip, cross, hook! Defensive combo!',
  'Double jab, overhand right!',
  'Let your hands go! Don\'t hold back!',
  'Burst! Burst! Throw a burst!',
  'One, two, three — circle away!',
];

const defenseCallouts = [
  'Slip left! Roll! Slip right!',
  'Hands up! Peek-a-boo!',
  'Slip the jab — counter with the right!',
  'Bob and weave! Don\'t be a statue!',
  'Roll under and come back with the hook!',
  'Parry! Parry and counter!',
  'Move your head! Keep it moving!',
  'Shoulder roll — let it brush off!',
  'Slip, slip, jab!',
  'Cover up! Elbows tight!',
  'Duck and counter! Bend those knees!',
  'Head movement! Head movement!',
  'Roll under the right, come up with the left hook!',
];

const footworkCallouts = [
  'Move! Circle left!',
  'Stay light on your feet!',
  'Lateral movement! Side to side!',
  'Pivot! Use that pivot!',
  'Don\'t back straight up — angle out!',
  'Step and slide! Step and slide!',
  'Cut the ring! Don\'t give him room!',
  'Move your feet every time you throw!',
  'In and out! In and out!',
  'Shuffle step! Keep the rhythm!',
  'Circle right! Change angles!',
  'Stay balanced — weight on the balls of your feet!',
];

const bodyShotCallouts = [
  'Body shot! Work the body!',
  'Jab to the body, cross to the head!',
  'Dig that left hook to the liver!',
  'Body, body, head! Switch levels!',
  'Break down the body! Break them down!',
  'Bend your knees — dig those body shots!',
  'Rip the ribs! Left hook, right hook!',
  'Body shot, step back, jab!',
  'Attack the solar plexus! Right uppercut to the body!',
  'Body hook — drop the elbow, dig in!',
];

// ─── Encouragement (always mixed in) ─────────────────────────────────────────

export const encouragementCallouts = [
  'That\'s it! Beautiful!',
  'Looking good! Stay sharp!',
  'Don\'t slow down! Keep the work rate up!',
  'You\'re doing great — keep pushing!',
  'Stay relaxed! Breathe!',
  'Good work! Keep it coming!',
  'That\'s the one! Repeat that!',
  'Beautiful combination — do it again!',
  'Breathe out when you throw!',
  'Chin down, eyes up! Protect yourself!',
  'Stay loose! Tight shoulders waste power!',
  'Trust your training!',
];

// ─── Time warnings ────────────────────────────────────────────────────────────

export const timeWarnings = {
  sixty: "Sixty seconds! Stay strong!",
  thirty: "Thirty seconds! Don't slow down!",
  ten: "Ten seconds! Everything you\'ve got — go!",
};

// ─── Rest callouts ────────────────────────────────────────────────────────────

export const restCallouts = {
  start: [
    "Time! Good round. Rest.",
    "That\'s it — breathe. Walk it out.",
    "Good work. Rest now, breathe.",
  ],
  mid: [
    "Breathe. You\'re doing great.",
    "Stay loose — shake out those arms.",
    "Hydrate if you need to. Breathe through your nose.",
    "Nice work. Stay focused.",
  ],
  tenSecWarning: [
    "Get ready. Next round coming up.",
    "Ten seconds. Let\'s go.",
    "Almost time. Get your hands up.",
  ],
  countdown: [
    "Three... two... one...",
  ],
};

// ─── Round start callouts ─────────────────────────────────────────────────────

export const roundStartCallouts: Record<number, string> = {
  1: "Round one! Let\'s go — work that jab!",
  2: "Round two! Stay sharp — hands up!",
  3: "Round three! Midway point — push through!",
  4: "Round four! Find your rhythm!",
  5: "Round five! Championship rounds — let\'s go!",
  6: "Round six! Dig deep — you\'re almost there!",
};

export const getRoundStartCallout = (roundNum: number): string => {
  return roundStartCallouts[roundNum] ?? `Round ${roundNum}! Let\'s go — keep pushing!`;
};

// ─── Complete callouts ────────────────────────────────────────────────────────

export const workoutCompleteCallout = "That\'s the session! Great work today. You put in the time — that\'s what matters.";

// ─── Callout selection logic ──────────────────────────────────────────────────

const focusCalloutMap: Record<FocusArea, string[]> = {
  jabs: jabCallouts,
  crosses: crossCallouts,
  hooks: hookCallouts,
  uppercuts: uppercutCallouts,
  combinations: combinationCallouts,
  defense: defenseCallouts,
  footwork: footworkCallouts,
  bodyShots: bodyShotCallouts,
};

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

const shuffleArray = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const buildCalloutPool = (focusAreas: FocusArea[]): string[] => {
  const areas = focusAreas.length > 0 ? focusAreas : ['combinations' as FocusArea];
  const pool: string[] = [];

  areas.forEach(area => {
    const areaCallouts = focusCalloutMap[area];
    pool.push(...areaCallouts);
  });

  // Mix in encouragement at ~20% frequency
  const encouragementCount = Math.max(1, Math.floor(pool.length * 0.2));
  const shuffledEncouragement = shuffleArray(encouragementCallouts).slice(0, encouragementCount);
  pool.push(...shuffledEncouragement);

  return shuffleArray(pool);
};

export const getCalloutIntervalRange = (intensity: Intensity): [number, number] => {
  switch (intensity) {
    case 'beginner':
      return [13, 20]; // seconds between callouts
    case 'intermediate':
      return [8, 14];
    case 'advanced':
      return [5, 10];
  }
};

/**
 * Generate callout timestamps (in ms from round start) for a given round duration.
 * Avoids the last 35s (reserved for time warnings at :30 and :10) and first 3s.
 */
export const generateCalloutTimestamps = (
  durationSeconds: number,
  intensity: Intensity,
): number[] => {
  const [minInterval, maxInterval] = getCalloutIntervalRange(intensity);
  const safeEnd = Math.max(0, durationSeconds - 35) * 1000;
  const safeStart = 3000;
  const timestamps: number[] = [];

  let cursor = safeStart;
  while (cursor < safeEnd) {
    timestamps.push(cursor);
    const interval = minInterval + Math.random() * (maxInterval - minInterval);
    cursor += interval * 1000;
  }

  return timestamps;
};
