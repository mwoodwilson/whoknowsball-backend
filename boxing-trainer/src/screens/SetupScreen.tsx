import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, radius, fontSize } from '../theme';
import { FocusArea, Intensity, Stance, WorkoutConfig, RootStackParamList } from '../types';
import { getFocusAreaLabel } from '../engine/callouts';
import { loadLastConfig, saveLastConfig } from '../utils/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

const FOCUS_AREAS: FocusArea[] = [
  'jabs',
  'crosses',
  'hooks',
  'uppercuts',
  'combinations',
  'defense',
  'footwork',
  'bodyShots',
];

const FOCUS_ICONS: Record<FocusArea, string> = {
  jabs: '🥊',
  crosses: '✊',
  hooks: '↩️',
  uppercuts: '⬆️',
  combinations: '🔥',
  defense: '🛡️',
  footwork: '👟',
  bodyShots: '💥',
};

const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const DURATION_OPTIONS = [
  { label: '1:00', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2:00', value: 120 },
  { label: '3:00', value: 180 },
  { label: '4:00', value: 240 },
  { label: '5:00', value: 300 },
];
const REST_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1:00', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2:00', value: 120 },
];
const INTENSITY_OPTIONS: { label: string; value: Intensity; desc: string }[] = [
  { label: 'Beginner', value: 'beginner', desc: 'Slow pace, basic combos' },
  { label: 'Intermediate', value: 'intermediate', desc: 'Steady pace, 2–3 punch combos' },
  { label: 'Advanced', value: 'advanced', desc: 'Fast pace, complex combos' },
];

const STANCE_OPTIONS: { label: string; value: Stance; desc: string }[] = [
  { label: 'Orthodox', value: 'orthodox', desc: 'Left foot forward' },
  { label: 'Southpaw', value: 'southpaw', desc: 'Right foot forward' },
];

export default function SetupScreen({ navigation }: Props) {
  const [rounds, setRounds] = useState(3);
  const [roundDuration, setRoundDuration] = useState(180);
  const [restDuration, setRestDuration] = useState(60);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(['combinations']);
  const [intensity, setIntensity] = useState<Intensity>('intermediate');
  const [stance, setStance] = useState<Stance>('orthodox');

  // Restore last session config on mount
  useEffect(() => {
    loadLastConfig().then(saved => {
      if (!saved) return;
      setRounds(saved.rounds);
      setRoundDuration(saved.roundDuration);
      setRestDuration(saved.restDuration);
      setFocusAreas(saved.focusAreas);
      setIntensity(saved.intensity);
      setStance(saved.stance);
    }).catch(() => {});
  }, []);

  const toggleFocus = (area: FocusArea) => {
    setFocusAreas(prev =>
      prev.includes(area)
        ? prev.length > 1
          ? prev.filter(a => a !== area)
          : prev // keep at least one
        : [...prev, area],
    );
  };

  const handleStart = () => {
    const config: WorkoutConfig = {
      rounds,
      roundDuration,
      restDuration,
      focusAreas,
      intensity,
      stance,
    };
    saveLastConfig(config).catch(() => {});
    navigation.navigate('Workout', { config });
  };

  const handleHistory = () => {
    navigation.navigate('History');
  };

  const totalMinutes = Math.round((rounds * roundDuration + (rounds - 1) * restDuration) / 60);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>CORNER</Text>
            <Text style={styles.tagline}>Your boxing trainer</Text>
          </View>
          <TouchableOpacity
            onPress={handleHistory}
            activeOpacity={0.7}
            style={styles.historyButton}
            accessibilityRole="button"
            accessibilityLabel="Workout history"
          >
            <Text style={styles.historyButtonText}>HISTORY</Text>
          </TouchableOpacity>
        </View>

        {/* Stance */}
        <Section title="STANCE">
          <View style={styles.stanceRow}>
            {STANCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.stanceChip,
                  stance === opt.value && styles.stanceChipSelected,
                ]}
                onPress={() => setStance(opt.value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: stance === opt.value }}
                accessibilityLabel={`${opt.label} stance, ${opt.desc}`}
              >
                <Text
                  style={[
                    styles.stanceLabel,
                    stance === opt.value && styles.stanceLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.stanceDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Rounds */}
        <Section title="ROUNDS">
          <View style={styles.chipRow}>
            {ROUND_OPTIONS.map(n => (
              <Chip
                key={n}
                label={String(n)}
                selected={rounds === n}
                onPress={() => setRounds(n)}
              />
            ))}
          </View>
        </Section>

        {/* Round Duration */}
        <Section title="ROUND LENGTH">
          <View style={styles.chipRow}>
            {DURATION_OPTIONS.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={roundDuration === opt.value}
                onPress={() => setRoundDuration(opt.value)}
              />
            ))}
          </View>
        </Section>

        {/* Rest Duration */}
        <Section title="REST BETWEEN ROUNDS">
          <View style={styles.chipRow}>
            {REST_OPTIONS.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={restDuration === opt.value}
                onPress={() => setRestDuration(opt.value)}
              />
            ))}
          </View>
        </Section>

        {/* Focus Areas */}
        <Section title="FOCUS AREAS" subtitle="Select one or more">
          <View style={styles.focusGrid}>
            {FOCUS_AREAS.map(area => (
              <TouchableOpacity
                key={area}
                style={[
                  styles.focusChip,
                  focusAreas.includes(area) && styles.focusChipSelected,
                ]}
                onPress={() => toggleFocus(area)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: focusAreas.includes(area) }}
                accessibilityLabel={getFocusAreaLabel(area)}
              >
                <Text style={styles.focusIcon}>{FOCUS_ICONS[area]}</Text>
                <Text
                  style={[
                    styles.focusLabel,
                    focusAreas.includes(area) && styles.focusLabelSelected,
                  ]}
                >
                  {getFocusAreaLabel(area)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Intensity */}
        <Section title="TRAINER INTENSITY">
          <View style={styles.intensityRow}>
            {INTENSITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.intensityChip,
                  intensity === opt.value && styles.intensityChipSelected,
                ]}
                onPress={() => setIntensity(opt.value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: intensity === opt.value }}
                accessibilityLabel={`${opt.label} intensity, ${opt.desc}`}
              >
                <Text
                  style={[
                    styles.intensityLabel,
                    intensity === opt.value && styles.intensityLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.intensityDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {rounds} rounds · {DURATION_OPTIONS.find(d => d.value === roundDuration)?.label} each ·{' '}
            ~{totalMinutes} min total
          </Text>
        </View>
      </ScrollView>

      {/* Start Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStart}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Start training, ${rounds} rounds`}
        >
          <Text style={styles.startButtonText}>START TRAINING</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  historyButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  logo: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 6,
  },
  tagline: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    letterSpacing: 1,
  },
  section: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    opacity: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.white,
  },
  focusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  focusChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  focusChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  focusIcon: {
    fontSize: 18,
  },
  focusLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  focusLabelSelected: {
    color: colors.text,
  },
  intensityRow: {
    gap: spacing.sm,
  },
  intensityChip: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  intensityChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  intensityLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  intensityLabelSelected: {
    color: colors.primary,
  },
  intensityDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  stanceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stanceChip: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stanceChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  stanceLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stanceLabelSelected: {
    color: colors.primary,
  },
  stanceDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'android' ? spacing.lg : spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 2,
  },
});
