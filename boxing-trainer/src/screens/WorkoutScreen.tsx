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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, radius } from '../theme';
import { WorkoutPhase, RootStackParamList } from '../types';
import { TrainerEngine } from '../engine/TrainerEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'Workout'>;

const PRE_COUNTDOWN_SECONDS = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RING_SIZE = SCREEN_WIDTH * 0.72;

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function WorkoutScreen({ navigation, route }: Props) {
  const { config } = route.params;

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
      trainerRef.current?.startRound(1, config.roundDuration);
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
        setTimeout(() => {
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
      trainerRef.current?.startRound(nextRound, config.roundDuration);
    }
  }, [config, navigation, startRingPulse]);

  // Initialize trainer and start the tick
  useEffect(() => {
    trainerRef.current = new TrainerEngine(config, handleCallout);
    trainerRef.current.announcePreCountdown();

    intervalRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      if (phaseRef.current === 'complete') return;

      secondsLeftRef.current -= 1;
      setSecondsLeft(secondsLeftRef.current);

      if (secondsLeftRef.current <= 0) {
        transitionPhase();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      trainerRef.current?.stop();
      ringPulseAnimation.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePauseResume = () => {
    const pausing = !isPaused;
    isPausedRef.current = pausing;
    setIsPaused(pausing);
    if (pausing) {
      trainerRef.current?.stop();
      startRingPulse(false);
    } else {
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

  const ringColor = isRound ? colors.primary : isRest ? colors.rest : colors.textMuted;
  const ringGlow = isRound ? colors.primaryGlow : isRest ? colors.restGlow : 'transparent';

  const phaseLabel = isCountdown
    ? 'GET READY'
    : isRest
      ? 'REST'
      : `ROUND ${currentRound}`;

  const phaseColor = isRound ? colors.primary : isRest ? colors.rest : colors.textMuted;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Round indicator */}
      <View style={styles.topBar}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        {!isCountdown && (
          <Text style={styles.roundCounter}>
            {isRest
              ? `NEXT: ROUND ${currentRound + 1}`
              : `${currentRound} / ${config.rounds}`}
          </Text>
        )}
      </View>

      {/* Timer ring */}
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: ringColor,
              shadowColor: ringColor,
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
        >
          <Text style={styles.pauseButtonText}>{isPaused ? '▶  RESUME' : '⏸  PAUSE'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.stopButton} onPress={handleStop} activeOpacity={0.8}>
          <Text style={styles.stopButtonText}>STOP</Text>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  stopButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
  },
});
