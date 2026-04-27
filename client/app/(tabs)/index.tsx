import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { cartApi, mealApi, profileApi, recipeApi, type Meal, type Profile, type Recipe } from '../../services/api';
import RecipeCard from '../../components/RecipeCard';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [meals,        setMeals]        = useState<Meal[]>([]);
  const [recipes,      setRecipes]      = useState<Recipe[]>([]);
  const [stats,        setStats]        = useState({ mealsPlanned: 0, uniqueRecipes: 0, totalCookMins: 0 });
  const [groceryCount, setGroceryCount] = useState(0);
  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    try {
      const [m, r, s, p, cart] = await Promise.all([
        mealApi.list(todayStr),
        recipeApi.list(),
        mealApi.stats(todayStr),
        profileApi.get(),
        cartApi.get(todayStr),
      ]);
      setMeals(m);
      setRecipes(r.slice(0, 6));
      setStats(s);
      setProfile(p);
      setGroceryCount(cart.items.length);
    } catch {}
  }, [todayStr]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const todayMeals = meals.filter(m => m.date === todayStr);

  // Derive avatar initials from the profile name (up to 2 characters).
  const avatarInitials = profile
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const avatarColor = profile?.avatar_color || Colors.accent;

  const toggleSave = async (recipe: Recipe) => {
    await recipeApi.patch(recipe.id, { is_saved: recipe.is_saved ? 0 : 1 });
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_saved: r.is_saved ? 0 : 1 } : r));
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>Mise.</Text>
          <Text style={styles.tagline}>Your week at a glance</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.navigate('/library')}>
            <Ionicons name="search-outline" size={20} color={Colors.fgPrimary} />
          </TouchableOpacity>
          {/* router.navigate switches to the Profile tab; push would stack it. */}
          <TouchableOpacity onPress={() => router.navigate('/profile')}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{avatarInitials}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* This Week's Plan */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>This Week's Plan</Text>
            <TouchableOpacity onPress={() => router.navigate('/build')}>
              <Text style={styles.seeAll}>Full Plan</Text>
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Meals Set', value: stats.mealsPlanned },
              { label: 'Today', value: todayMeals.length },
              { label: 'Groceries', value: groceryCount },
            ].map(s => (
              <View key={s.label} style={styles.statCard}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Today label */}
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Today · {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]}</Text>
            <Text style={styles.todayDate}>{MONTH_NAMES[new Date().getMonth()]} {new Date().getDate()}</Text>
          </View>

          {/* Today's meals */}
          {todayMeals.length === 0 ? (
            <View style={styles.emptyDay}>
              <Ionicons name="restaurant-outline" size={24} color={Colors.fgMuted} />
              <Text style={styles.emptyDayText}>Nothing planned today</Text>
              <TouchableOpacity onPress={() => router.navigate('/build')}>
                <Text style={styles.emptyDayLink}>+ Add a meal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mealList}>
              {todayMeals.map(meal => (
                <TouchableOpacity
                  key={meal.id}
                  style={styles.mealItem}
                  onPress={() => router.push(`/recipe/${meal.recipe_id}`)}
                >
                  {meal.image_url ? (
                    <Image source={{ uri: meal.image_url }} style={styles.mealThumb} />
                  ) : (
                    <View style={[styles.mealThumb, styles.mealThumbEmpty]}>
                      <Ionicons name="restaurant-outline" size={16} color={Colors.fgMuted} />
                    </View>
                  )}
                  <View style={styles.mealInfo}>
                    <Text style={styles.mealType}>{meal.meal_type}</Text>
                    <Text style={styles.mealTitle}>{meal.title}</Text>
                  </View>
                  <View style={styles.mealTime}>
                    <Ionicons name="time-outline" size={12} color={Colors.fgMuted} />
                    <Text style={styles.mealTimeText}>{(meal.prep_time||0)+(meal.cook_time||0)}m</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Recently Added */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Recently Added</Text>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={9} color="#fff" />
                <Text style={styles.aiBadgeText}>AI RECOMMEND</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.navigate('/library')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recipeList}>
            {recipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onPress={() => router.push(`/recipe/${recipe.id}`)}
                onToggleSave={() => toggleSave(recipe)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  logo: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    color: Colors.fgPrimary,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.fgMuted,
    marginTop: 2,
  },
  headerRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconBtn: {
    width: 40, height: 40, borderRadius: 99,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 99,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.fgInverse, fontFamily: 'Inter_700Bold', fontSize: 16 },
  scroll: { padding: 20, gap: 24, paddingBottom: 12 },
  section: { gap: 14 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: Colors.fgPrimary },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6B3FA0',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 7, color: '#fff', letterSpacing: 0.3 },
  seeAll: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.accent },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.fgPrimary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgSecondary },
  todayDate: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  mealList: { gap: 6 },
  mealItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  mealThumb: { width: 44, height: 44, borderRadius: 8 },
  mealThumbEmpty: { backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1, gap: 2 },
  mealType: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.fgMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgPrimary },
  mealTime: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  mealTimeText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted },
  emptyDay: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
  },
  emptyDayText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted },
  emptyDayLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent },
  recipeList: { gap: 10 },
});
