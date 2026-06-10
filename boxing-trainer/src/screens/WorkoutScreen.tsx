import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  StatusBar,
  Dimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync } from 'expo-audio';
import { colors, spacing, fontSize, radius } from '../theme';
import { WorkoutPhase, RootStackParamList } from '../types';
import { TrainerEngine } from '../engine/TrainerEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'Workout'>;

const PRE_COUNTDOWN_SECONDS = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RING_SIZE = SCREEN_WIDTH * 0.72;
const ARC_STROKE = 5;

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// SVG arc that drains clockwise as the rest timer counts down.
function RestArc({ size, progress }: { size: number; progress: number }) {
  const r = (size - ARC_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <Svg
      width={size}
      height={size}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.rest}
        strokeWidth={ARC_STROKE}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export default function WorkoutScreen({ navigation, route }: Props) {
  const { config } = route.params;

  // Keep screen awake for the entire workout
  useKeepAwake();

  const [phase, setPhase] = useState<WorkoutPhase>('pre_countdown');
  const [currentRound, setCurrentRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(PRE_COUNTDOWN_SECONDS);
  const [currentCallout, setCurrentCallout] = useState('Get ready...');
  const [isPaused, setIsPaused] = useState(false);

  // Refs to avoid stale closures inside setInterval
  const phaseRef = useRef<WorkoutPhase>('pre_countdown');
  const currentRoundRef = useRef(1);
  const secondsLeftRef = useRef(PRE_COUNTDOWN_SECONDS);
  const isPausedRef = useRef(false);
  const trainerRef = useRef<TrainerEngine | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalWorkTimeRef = useRef(0);

  // Animation values
  const calloutOpacity = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(1)).current;
  const ringPulseAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const animateCallout = useCallback(() => {
    calloutOpacity.setValue(0);
    Animated.timing(calloutOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [calloutOpacity]);

  const startRingPulse = useCallback(
    (active: boolean) => {
      if (ringPulseAnimation.current) {
        ringPulseAnimation.current.stop();
      }
      if (active) {
        ringPulseAnimation.current = Animated.loop(
          Animated.sequence([
            Animated.timing(ringPulse, {
              toValue: 1.04,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(ringPulse, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
        );
        ringPulseAnimation.current.start();
      } else {
        Animated.timing(ringPulse, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    [ringPulse],
  );

  const handleCallout = useCallback(
    (text: string) => {
      setCurrentCallout(text);
      animateCallout();
    },
    [animateCallout],
  );

  // Auto-pause when app goes to background (phone call, home button, etc.)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!isPausedRef.current && phaseRef.current !== 'complete') {
          isPausedRef.current = true;
          setIsPaused(true);
          trainerRef.current?.pause();
          startRingPulse(false);
        }
      }
    });
    return () => subscription.remove();
  }, [startRingPulse]);

  // Phase transition logic (called from inside the interval — use refs)
  const transitionPhase = useCallback(() => {
    const current = phaseRef.current;
    const round = currentRoundRef.current;

    if (current === 'pre_countdown') {
      // Start round 1
      phaseRef.current = 'round';
      currentRoundRef.current = 1;
      secondsLeftRef.current = config.roundDuration;
      setPhase('round');
      setCurrentRound(1);
      setSecondsLeft(config.roundDuration);
      startRingPulse(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      trainerRef.current?.startRound(1, config.rounds, config.roundDuration);
    } else if (current === 'round') {
      // Round ended
      totalWorkTimeRef.current += config.roundDuration;
      startRingPulse(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      if (round >= config.rounds) {
        // Final round — go to complete
        phaseRef.current = 'complete';
        setPhase('complete');
        trainerRef.current?.startRest(0, 0, true);
        // Navigate after trainer speaks
        completionTimeoutRef.current = setTimeout(() => {
          navigation.replace('Complete', {
            roundsCompleted: config.rounds,
            totalWorkTime: totalWorkTimeRef.current,
            config,
          });
        }, 3500);
      } else {
        // Go to rest
        phaseRef.current = 'rest';
        secondsLeftRef.current = config.restDuration;
        setPhase('rest');
        setSecondsLeft(config.restDuration);
        trainerRef.current?.startRest(config.restDuration, round + 1, false);
      }
    } else if (current === 'rest') {
      // Rest ended — start next round
      const nextRound = round + 1;
      phaseRef.current = 'round';
      currentRoundRef.current = nextRound;
      secondsLeftRef.current = config.roundDuration;
      setPhase('round');
      setCurrentRound(nextRound);
      setSecondsLeft(config.roundDuration);
      startRingPulse(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      trainerRef.current?.startRound(nextRound, config.rounds, config.roundDuration);
    }
  }, [config, navigation, startRingPulse]);

  // Initialize trainer and start the tick
  useEffect(() => {
    // Play trainer voice even when the iOS silent switch is on — most people
    // train with their phone muted
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

    trainerRef.current = new TrainerEngine(config, handleCallout);
    trainerRef.current.announcePreCountdown();

    intervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      if (phaseRef.current === 'complete') return;

      secondsLeftRef.current -= 1;
      setSecondsLeft(secondsLeftRef.current);

      // Haptic ticks for the final 3 seconds before a round starts
      const p = phaseRef.current;
      if (
        (p === 'pre_countdown' || p === 'rest') &&
        secondsLeftRef.current > 0 &&
        secondsLeftRef.current <= 3
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (secondsLeftRef.current <= 0) {
        transitionPhase();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
      trainerRef.current?.stop();
      ringPulseAnimation.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePauseResume = () => {
    const pausing = !isPaused;
    isPausedRef.current = pausing;
    setIsPaused(pausing);
    if (pausing) {
      trainerRef.current?.pause();
      startRingPulse(false);
    } else {
      trainerRef.current?.resume();
      startRingPulse(phaseRef.current === 'round');
    }
  };

  const handleStop = () => {
    Alert.alert('Stop Workout?', 'Are you sure you want to end this session?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
          trainerRef.current?.stop();
          navigation.goBack();
        },
      },
    ]);
  };

  // Derived display values
  const isRound = phase === 'round';
  const isRest = phase === 'rest';
  const isCountdown = phase === 'pre_countdown';

  const ringColor = isRound ? colors.primary : isRest ? colors.border : colors.textMuted;
  const ringGlow = isRound ? colors.primaryGlow : 'transparent';

  const phaseLabel = isCountdown
    ? 'GET READY'
    : isRest
      ? 'REST'
      : `ROUND ${currentRound}`;

  const phaseColor = isRound ? colors.primary : isRest ? colors.rest : colors.textMuted;

  const restProgress = isRest ? secondsLeft / config.restDuration : 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Round indicator */}
      <View style={styles.topBar}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        {!isCountdown && isRest && (
          <Text style={styles.roundCounter}>NEXT: ROUND {currentRound + 1}</Text>
        )}
      </View>

      {/* Round progress dots */}
      {!isCountdown && (
        <View
          style={styles.dotsRow}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Round ${currentRound} of ${config.rounds}`}
        >
          {Array.from({ length: config.rounds }, (_, i) => {
            const roundNum = i + 1;
            const done = roundNum < currentRound || (roundNum === currentRound && isRest);
            const active = roundNum === currentRound && isRound;
            return (
              <View
                key={roundNum}
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  active && styles.dotActive,
                ]}
              />
            );
          })}
        </View>
      )}

      {/* Timer ring */}
      <View style={styles.center}>
        <View style={styles.ringContainer}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: ringColor,
                shadowColor: isRound ? colors.primary : colors.rest,
                backgroundColor: ringGlow,
                transform: [{ scale: ringPulse }],
              },
            ]}
          >
            <Text style={[styles.timerText, isRound && secondsLeft <= 10 && styles.timerTextWarning]}>
              {isCountdown ? secondsLeft : formatTime(secondsLeft)}
            </Text>
            <Text style={[styles.timerSubLabel, { color: phaseColor }]}>
              {isCountdown ? 'seconds' : isRest ? 'rest' : 'remaining'}
            </Text>
          </Animated.View>

          {/* Draining arc overlay during rest */}
          {isRest && <RestArc size={RING_SIZE} progress={restProgress} />}
        </View>
      </View>

      {/* Callout display */}
      <View style={styles.calloutContainer}>
        <Animated.Text style={[styles.calloutText, { opacity: calloutOpacity }]}>
          {currentCallout}
        </Animated.Text>
      </View>

      {/* Paused overlay */}
      {isPaused && (
        <View style={styles.pausedBadge}>
          <Text style={styles.pausedText}>PAUSED</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.pauseButton}
          onPress={handlePauseResume}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isPaused ? 'Resume workout' : 'Pause workout'}
        >
          <Text style={styles.pauseButtonText}>{isPaused ? '▶  RESUME' : '⏸  PAUSE'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleStop}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Stop workout"
        >
          <Text style={styles.stopButtonText}>END WORKOUT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseLabel: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    letterSpacing: 3,
  },
  roundCounter: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotDone: {
    backgroundColor: colors.textMuted,
  },
  dotActive: {
    backgroundColor: colors.primary,
    transform: [{ scale: 1.25 }],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.6,
    elevation: 12,
  },
  timerText: {
    fontSize: fontSize.timer,
    fontWeight: '900',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  timerTextWarning: {
    color: colors.primary,
  },
  timerSubLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: -4,
  },
  calloutContainer: {
    minHeight: 90,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  calloutText: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 36,
  },
  pausedBadge: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.warning,
    marginBottom: spacing.sm,
  },
  pausedText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.warning,
    letterSpacing: 2,
  },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  pauseButton: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pauseButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
  },
  stopButton: {
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 52, 42, 0.35)',
  },
  stopButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 2,
  },
});
