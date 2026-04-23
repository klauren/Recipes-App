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

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await recipeApi.list({ saved: 1 });
      setRecipes(data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const toggleSave = async (recipe: Recipe) => {
    await recipeApi.patch(recipe.id, { is_saved: 0 });
    setRecipes(prev => prev.filter(r => r.id !== recipe.id));
  };

  const filtered = recipes.filter(r => {
    const matchCat = activeCategory === 'All' || r.category === activeCategory;
    const matchQ = !search || r.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Saved Recipes</Text>
          <Text style={styles.sub}>Your favorite dishes</Text>
        </View>
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
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.tag, activeCategory === cat && styles.tagActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.tagText, activeCategory === cat && styles.tagTextActive]}>
              {cat}
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
              <Ionicons name="heart-outline" size={40} color={Colors.fgMuted} />
              <Text style={styles.emptyTitle}>No saved recipes</Text>
              <Text style={styles.emptySub}>
                {search ? 'Try a different search' : 'Browse recipes and tap ♡ to save them'}
              </Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => router.navigate('/add')}>
                <Text style={styles.addBtnText}>Add a Recipe</Text>
              </TouchableOpacity>
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
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, color: Colors.fgPrimary },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted, marginTop: 2 },
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
  tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgPrimary },
  tagTextActive: { color: Colors.fgInverse },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: Colors.fgPrimary },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgMuted, textAlign: 'center' },
  addBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: 99,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  addBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgInverse },
});
