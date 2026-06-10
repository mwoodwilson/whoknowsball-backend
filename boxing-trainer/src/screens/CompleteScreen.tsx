import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors, spacing, fontSize, radius } from '../theme';
import { RootStackParamList } from '../types';
import { getFocusAreaLabel } from '../engine/callouts';
import { saveWorkoutSession } from '../utils/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Complete'>;

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
};

export default function CompleteScreen({ navigation, route }: Props) {
  const { roundsCompleted, totalWorkTime, config } = route.params;

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    saveWorkoutSession({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      roundsCompleted,
      totalWorkTime,
      config,
    }).catch(() => {});

    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeIn, slideUp]);

  const handleShare = async () => {
    const focusLabel = config.focusAreas.map(getFocusAreaLabel).join(', ');
    const intensity = config.intensity.charAt(0).toUpperCase() + config.intensity.slice(1);
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    await Share.share({
      message:
        `🥊 CORNER — Workout Complete\n\n` +
        `${roundsCompleted}/${config.rounds} rounds · ${formatDuration(totalWorkTime)}\n` +
        `${intensity} · ${focusLabel}\n\n` +
        `${date}`,
    });
  };

  const handleGoAgain = () => {
    navigation.replace('Workout', { config });
  };

  const handleSetup = () => {
    navigation.popToTop();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
          },
        ]}
      >
        {/* Victory header */}
        <View style={styles.header}>
          <Text style={styles.gloveEmoji}>🥊</Text>
          <Text style={styles.completeLabel}>WORKOUT COMPLETE</Text>
          <Text style={styles.subtitle}>Great session. You put in the work.</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <StatRow
            label="Rounds Completed"
            value={`${roundsCompleted} / ${config.rounds}`}
          />
          <View style={styles.divider} />
          <StatRow
            label="Work Time"
            value={formatDuration(totalWorkTime)}
          />
          <View style={styles.divider} />
          <StatRow
            label="Round Length"
            value={formatDuration(config.roundDuration)}
          />
          <View style={styles.divider} />
          <StatRow
            label="Focus"
            value={config.focusAreas.map(getFocusAreaLabel).join(', ')}
            valueSize={fontSize.sm}
          />
          <View style={styles.divider} />
          <StatRow
            label="Intensity"
            value={config.intensity.charAt(0).toUpperCase() + config.intensity.slice(1)}
          />
        </View>

        {/* Motivational message */}
        <Text style={styles.motivational}>
          {roundsCompleted >= config.rounds
            ? "You went the full distance. That's what champions do."
            : `${roundsCompleted} solid rounds. Come back and finish what you started.`}
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.goAgainButton}
            onPress={handleGoAgain}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Do the same workout again"
          >
            <Text style={styles.goAgainText}>GO AGAIN</Text>
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, styles.shareButton]}
              onPress={handleShare}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Share this workout"
            >
              <Text style={styles.shareButtonText}>SHARE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, styles.setupButton]}
              onPress={handleSetup}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change workout settings"
            >
              <Text style={styles.setupButtonText}>CHANGE SETTINGS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

function StatRow({
  label,
  value,
  valueSize,
}: {
  label: string;
  value: string;
  valueSize?: number;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueSize ? { fontSize: valueSize } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  gloveEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  completeLabel: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  statValue: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '60%',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  motivational: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  actions: {
    gap: spacing.sm,
  },
  goAgainButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  goAgainText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  shareButton: {
    borderColor: colors.rest,
  },
  shareButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.rest,
    letterSpacing: 1.5,
  },
  setupButton: {
    borderColor: colors.border,
  },
  setupButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
});
