import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { mealApi, recipeApi, type Recipe } from '../services/api';

const FILTERS = ['All', 'Quick', 'Favorites', 'Recent'] as const;
type Filter = typeof FILTERS[number];

export default function AddMealScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // date, mealType, and dayName are passed as URL params from the Menu Builder.
  const { date, mealType, dayName } = useLocalSearchParams<{
    date: string;
    mealType: string;
    dayName: string;
  }>();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null); // id of the recipe being saved
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const load = useCallback(async () => {
    try {
      const all = await recipeApi.list();
      setRecipes(all);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  const handleSelect = async (recipe: Recipe) => {
    if (!date || !mealType) return;
    setSaving(recipe.id);
    try {
      await mealApi.create({
        recipe_id: recipe.id,
        date,
        meal_type: mealType,
        servings: recipe.servings || 2,
      });
      router.back();
    } catch {
      setSaving(null);
    }
  };

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = recipes.filter(r => {
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'All'       ? true :
      filter === 'Quick'     ? (r.prep_time + r.cook_time) <= 30 :
      filter === 'Favorites' ? r.is_saved === 1 :
      filter === 'Recent'    ? true : // already sorted newest-first from the API
      true;
    return matchSearch && matchFilter;
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.fgPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Add Meal</Text>
        {/* Invisible spacer keeps title centred */}
        <View style={{ width: 22 }} />
      </View>

      {/* Context pill: "Wednesday · Dinner" */}
      <View style={styles.contextRow}>
        <View style={styles.contextPill}>
          <Text style={styles.contextText}>
            {dayName} · {mealType}
          </Text>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.fgMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your recipes..."
          placeholderTextColor={Colors.fgMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.fgMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Recipe list ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={36} color={Colors.fgMuted} />
              <Text style={styles.emptyText}>No recipes found</Text>
            </View>
          ) : (
            filtered.map(recipe => (
              <TouchableOpacity
                key={recipe.id}
                style={styles.row}
                onPress={() => handleSelect(recipe)}
                activeOpacity={0.8}
                disabled={saving !== null}
              >
                {recipe.image_url ? (
                  <Image source={{ uri: recipe.image_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="restaurant-outline" size={20} color={Colors.fgMuted} />
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{recipe.title}</Text>
                  <View style={styles.rowMeta}>
                    {(recipe.prep_time + recipe.cook_time) > 0 && (
                      <Text style={styles.metaText}>
                        {recipe.prep_time + recipe.cook_time}m
                      </Text>
                    )}
                    <Text style={styles.metaText}>{recipe.difficulty}</Text>
                    {recipe.category ? <Text style={styles.metaText}>{recipe.category}</Text> : null}
                  </View>
                </View>
                {saving === recipe.id ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: Colors.fgPrimary,
    textAlign: 'center',
  },
  contextRow: { alignItems: 'center', marginBottom: 16 },
  contextPill: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contextText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgSecondary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgPrimary },
  filters: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgPrimary },
  chipTextActive: { color: Colors.fgInverse },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 12,
    paddingRight: 14,
  },
  thumb: { width: 72, height: 72 },
  thumbEmpty: {
    backgroundColor: Colors.surfacePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 4, paddingVertical: 12 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.fgPrimary },
  rowMeta: { flexDirection: 'row', gap: 8 },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgMuted },
});
