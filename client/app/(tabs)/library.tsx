import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { recipeApi, type Recipe } from '../../services/api';
import RecipeCard from '../../components/RecipeCard';

const CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await recipeApi.list();
      setRecipes(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const toggleSave = async (recipe: Recipe) => {
    const next = recipe.is_saved ? 0 : 1;
    await recipeApi.patch(recipe.id, { is_saved: next });
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_saved: next } : r));
  };

  const filtered = recipes.filter(r => {
    const matchCat = activeCategory === 'All' || r.category === activeCategory;
    const matchQ = !search || r.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  // Build category counts for labels
  const counts: Record<string, number> = { All: recipes.length };
  CATEGORIES.slice(1).forEach(cat => {
    counts[cat] = recipes.filter(r => r.category === cat).length;
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Library</Text>
          <Text style={styles.sub}>Your recipe collection</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add')}>
          <Ionicons name="add" size={16} color={Colors.fgInverse} />
          <Text style={styles.addBtnText}>Add Recipe</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.fgMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
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

      {/* Category tags */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tags}
      >
        {CATEGORIES.filter(cat => cat === 'All' || counts[cat] > 0).map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.tag, activeCategory === cat && styles.tagActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.tagText, activeCategory === cat && styles.tagTextActive]}>
              {cat}{cat !== 'All' ? ` (${counts[cat]})` : ` (${counts.All})`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={40} color={Colors.fgMuted} />
              <Text style={styles.emptyTitle}>
                {recipes.length === 0 ? 'No recipes yet' : 'No matches'}
              </Text>
              <Text style={styles.emptySub}>
                {search
                  ? 'Try a different search'
                  : recipes.length === 0
                    ? 'Add your first recipe to get started'
                    : `No recipes in ${activeCategory}`}
              </Text>
              {recipes.length === 0 && (
                <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/add')}>
                  <Text style={styles.ctaBtnText}>Add a Recipe</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map(r => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onPress={() => router.push(`/recipe/${r.id}`)}
                  onToggleSave={() => toggleSave(r)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, color: Colors.fgPrimary },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.fgInverse },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.fgPrimary,
  },
  tags: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  tag: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tagActive: { backgroundColor: Colors.accent },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.fgPrimary },
  tagTextActive: { color: Colors.fgInverse },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: Colors.fgPrimary },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgMuted, textAlign: 'center' },
  ctaBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: 99,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  ctaBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgInverse },
});
