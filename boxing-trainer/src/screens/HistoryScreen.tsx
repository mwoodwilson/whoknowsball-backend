import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius } from '../theme';
import { WorkoutSession, RootStackParamList } from '../types';
import { loadWorkoutHistory } from '../utils/storage';
import { getFocusAreaLabel } from '../engine/callouts';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
};

// Returns the date portion of an ISO string in local time (YYYY-MM-DD).
// Using slice(0,10) on an ISO string gives UTC date, which is wrong for users
// in timezones offset from UTC — compute it from the Date object instead.
const localDateKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const todayKey = (): string => localDateKey(new Date().toISOString());

function computeStreak(sessions: WorkoutSession[]): number {
  if (sessions.length === 0) return 0;

  const uniqueDays = [...new Set(sessions.map(s => localDateKey(s.date)))].sort().reverse();

  const today = todayKey();
  const yesterday = localDateKey(new Date(Date.now() - 86_400_000).toISOString());

  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const curr = new Date(uniqueDays[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86_400_000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function computeWeeklyDays(sessions: WorkoutSession[]): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartKey = localDateKey(weekStart.toISOString());
  const todayK = todayKey();

  const uniqueDays = new Set(
    sessions
      .map(s => localDateKey(s.date))
      .filter(d => d >= weekStartKey && d <= todayK),
  );
  return uniqueDays.size;
}

export default function HistoryScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const history = await loadWorkoutHistory();
    setSessions(history);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const streak = computeStreak(sessions);
  const weeklyDays = computeWeeklyDays(sessions);

  const renderSession = ({ item }: { item: WorkoutSession }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
        <Text style={styles.cardTime}>{formatTime(item.date)}</Text>
      </View>
      <View style={styles.cardStats}>
        <StatPill label={`${item.roundsCompleted} rounds`} />
        <StatPill label={formatDuration(item.totalWorkTime)} />
        <StatPill label={item.config.intensity} />
      </View>
      <Text style={styles.cardFocus} numberOfLines={1}>
        {item.config.focusAreas.map(getFocusAreaLabel).join(' · ')}
      </Text>
    </View>
  );

  const ListHeader = sessions.length > 0 ? (
    <View style={styles.statsHeader}>
      <StatBlock value={streak} label={streak === 1 ? 'DAY STREAK' : 'DAY STREAK'} accent={streak >= 3} />
      <View style={styles.statDivider} />
      <StatBlock value={weeklyDays} label="DAYS THIS WEEK" />
      <View style={styles.statDivider} />
      <StatBlock value={sessions.length} label="TOTAL SESSIONS" />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>HISTORY</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? null : sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptySubtitle}>Complete a workout to see your history here.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={item => item.id}
          renderItem={renderSession}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function StatPill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function StatBlock({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.statBlock} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.statBlockValue, accent && styles.statBlockValueAccent]}>{value}</Text>
      <Text style={styles.statBlockLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 64,
  },
  backText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 3,
  },
  statsHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statBlockValue: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1,
  },
  statBlockValueAccent: {
    color: colors.primary,
  },
  statBlockLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardDate: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  cardTime: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  cardStats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardFocus: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pill: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
