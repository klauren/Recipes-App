import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { mealApi, type GridDay, type Meal, type WeekGrid } from '../services/api';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'] as const;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Advances a YYYY-MM-DD string by `days` days. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatWeekRange(ws: string, we: string): string {
  const s = new Date(ws), e = new Date(we);
  const sm = MONTH_NAMES[s.getMonth()], em = MONTH_NAMES[e.getMonth()];
  if (sm === em) return `${sm} ${s.getDate()}–${e.getDate()}`;
  return `${sm} ${s.getDate()} – ${em} ${e.getDate()}`;
}

export default function MenuBuilderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [grid, setGrid] = useState<WeekGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  // The week anchor we're currently viewing — any date in that week works.
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().split('T')[0]);

  const load = useCallback(async () => {
    try {
      const g = await mealApi.grid(anchorDate);
      setGrid(g);
    } catch {}
  }, [anchorDate]);

  // useFocusEffect handles the initial load and refresh-on-return-to-screen.
  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  // useEffect handles week navigation: when anchorDate changes while the screen
  // is already focused, useFocusEffect won't re-fire, so we need a separate effect.
  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const prevWeek = () => setAnchorDate(d => shiftDate(d, -7));
  const nextWeek = () => setAnchorDate(d => shiftDate(d, 7));

  const handleGenerate = async () => {
    Alert.alert(
      'Auto-fill Week',
      'Fill all empty Breakfast, Lunch, and Dinner slots with your saved recipes?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            try {
              const res = await mealApi.generate(anchorDate);
              await load();
              Alert.alert('Done!', `Added ${res.added} meals to this week.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const deleteMeal = async (meal: Meal) => {
    await mealApi.delete(meal.id);
    setGrid(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map(day => ({
          ...day,
          meals: day.meals.filter(m => m.id !== meal.id),
        })),
      };
    });
  };

  const todayStr = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.fgPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Menu Builder</Text>
        <TouchableOpacity
          style={[styles.generateBtn, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator size="small" color={Colors.fgInverse} />
            : <Ionicons name="flash" size={14} color={Colors.fgInverse} />
          }
          <Text style={styles.generateText}>Generate</Text>
        </TouchableOpacity>
      </View>

      {/* ── Week navigator ── */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={prevWeek} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={Colors.fgMuted} />
        </TouchableOpacity>
        <View style={styles.weekCenter}>
          <Text style={styles.weekRange}>
            {grid ? formatWeekRange(grid.weekStart, grid.weekEnd) : '—'}
          </Text>
          <Text style={styles.weekYear}>{new Date(anchorDate).getFullYear()}</Text>
        </View>
        <TouchableOpacity onPress={nextWeek} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={Colors.fgMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {grid?.days.map(day => (
          <DayColumn
            key={day.date}
            day={day}
            isToday={day.date === todayStr}
            onAddMeal={(mealType) =>
              router.push({
                pathname: '/add-meal',
                params: { date: day.date, mealType, dayName: day.dayName },
              })
            }
            onDeleteMeal={deleteMeal}
            onPressMeal={(meal) => router.push(`/recipe/${meal.recipe_id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── Day column component ──────────────────────────────────────────────────────

interface DayColumnProps {
  day: GridDay;
  isToday: boolean;
  onAddMeal: (mealType: string) => void;
  onDeleteMeal: (meal: Meal) => void;
  onPressMeal: (meal: Meal) => void;
}

function DayColumn({ day, isToday, onAddMeal, onDeleteMeal, onPressMeal }: DayColumnProps) {
  const dateNum = new Date(day.date).getDate();

  return (
    <View style={dayStyles.container}>
      {/* Day label */}
      <View style={dayStyles.labelRow}>
        <View style={[dayStyles.dateBadge, isToday && dayStyles.dateBadgeToday]}>
          <Text style={[dayStyles.dayName, isToday && dayStyles.dayNameToday]}>{day.dayName}</Text>
          <Text style={[dayStyles.dateNum, isToday && dayStyles.dateNumToday]}>{dateNum}</Text>
        </View>
        {isToday && <Text style={dayStyles.todayChip}>Today</Text>}
      </View>

      {/* Meal slots */}
      <View style={dayStyles.slots}>
        {MEAL_TYPES.map(mt => {
          const meal = day.meals.find(m => m.meal_type === mt);
          return meal
            ? <FilledSlot key={mt} meal={meal} onPress={() => onPressMeal(meal)} onDelete={() => onDeleteMeal(meal)} />
            : <EmptySlot key={mt} mealType={mt} onPress={() => onAddMeal(mt)} />;
        })}
      </View>
    </View>
  );
}

function FilledSlot({ meal, onPress, onDelete }: { meal: Meal; onPress: () => void; onDelete: () => void }) {
  return (
    <TouchableOpacity style={slotStyles.filled} onPress={onPress} activeOpacity={0.85}>
      {meal.image_url ? (
        <Image source={{ uri: meal.image_url }} style={slotStyles.thumb} />
      ) : (
        <View style={[slotStyles.thumb, slotStyles.thumbEmpty]}>
          <Ionicons name="restaurant-outline" size={14} color={Colors.fgMuted} />
        </View>
      )}
      <View style={slotStyles.filledBody}>
        <Text style={slotStyles.mealType}>{meal.meal_type}</Text>
        <Text style={slotStyles.mealTitle} numberOfLines={1}>{meal.title}</Text>
        <Text style={slotStyles.mealTime}>
          {(meal.prep_time || 0) + (meal.cook_time || 0)}m
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={slotStyles.deleteBtn}>
        <Ionicons name="close-circle" size={16} color={Colors.fgMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function EmptySlot({ mealType, onPress }: { mealType: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={slotStyles.empty} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="add" size={16} color={Colors.fgMuted} />
      <Text style={slotStyles.emptyText}>{mealType}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.surfacePrimary },
  center:  { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 26,
    color: Colors.fgPrimary,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  generateText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgInverse },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  weekCenter: { alignItems: 'center', gap: 2 },
  weekRange:  { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.fgPrimary },
  weekYear:   { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
});

const dayStyles = StyleSheet.create({
  container: { gap: 10 },
  labelRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateBadgeToday: { backgroundColor: Colors.accent },
  dayName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.fgMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameToday: { color: Colors.fgInverse },
  dateNum: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.fgPrimary },
  dateNumToday: { color: Colors.fgInverse },
  todayChip: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.accent },
  slots: { gap: 8 },
});

const slotStyles = StyleSheet.create({
  filled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  thumbEmpty: {
    backgroundColor: Colors.surfacePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledBody: { flex: 1, gap: 2 },
  mealType:  { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.fgMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgPrimary },
  mealTime:  { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  deleteBtn: { padding: 4 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderMed,
    borderStyle: 'dashed',
  },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted },
});
