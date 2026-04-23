import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { recipeApi, mealApi, type Recipe } from '../../services/api';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await recipeApi.get(Number(id));
      setRecipe(r);
    } catch {
      Alert.alert('Error', 'Could not load recipe');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleSave = async () => {
    if (!recipe) return;
    // is_saved is a SQLite integer (0 / 1), not a JS boolean.
    const updated = await recipeApi.patch(recipe.id, { is_saved: recipe.is_saved ? 0 : 1 });
    setRecipe(prev => prev ? { ...prev, is_saved: updated.is_saved } : prev);
  };

  const addToMealPlan = () => {
    if (!recipe) return;
    const today = new Date().toISOString().split('T')[0];
    // Alert.alert supports an array of buttons, one per meal type — no modal needed.
    Alert.alert('Add to Meal Plan', 'Choose meal type:', MEAL_TYPES.map(mt => ({
      text: mt,
      onPress: async () => {
        try {
          await mealApi.create({ recipe_id: recipe.id, date: today, meal_type: mt, servings: recipe.servings || 2 });
          Alert.alert('Added!', `${recipe.title} added to today's ${mt}`);
        } catch (e: any) {
          Alert.alert('Error', e.message);
        }
      },
    })));
  };

  const deleteRecipe = () => {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await recipeApi.delete(Number(id));
        router.back();
      }},
    ]);
  };

  if (loading || !recipe) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return (
    <View style={styles.screen}>
      {/* Hero Image */}
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        {recipe.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.heroBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroRight}>
            <TouchableOpacity style={styles.heroBtn} onPress={toggleSave}>
              <Ionicons
                name={recipe.is_saved ? 'heart' : 'heart-outline'}
                size={22}
                color={recipe.is_saved ? '#ff6b6b' : '#fff'}
              />
            </TouchableOpacity>
            {/* Navigate to the dedicated edit screen pre-loaded with this recipe. */}
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push(`/edit-recipe/${recipe.id}`)}>
              <Ionicons name="create-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={deleteRecipe}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={styles.title}>{recipe.title}</Text>
        {recipe.description ? <Text style={styles.desc}>{recipe.description}</Text> : null}

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: 'time-outline' as const, value: `${totalTime} min`, label: 'Total Time' },
            { icon: 'people-outline' as const, value: String(recipe.servings), label: 'Servings' },
            { icon: 'trending-up-outline' as const, value: recipe.difficulty, label: 'Difficulty' },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={20} color={Colors.accent} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <View style={styles.ingredientList}>
              {recipe.ingredients.map((ing, i) => (
                <View key={ing.id ?? i} style={styles.ingredientRow}>
                  <View style={styles.dot} />
                  <Text style={styles.ingredientText}>
                    {[ing.amount, ing.unit].filter(Boolean).join(' ')}{ing.amount ? ' ' : ''}{ing.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Instructions */}
        {recipe.instructions && recipe.instructions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <View style={styles.instructionList}>
              {recipe.instructions.map((inst, i) => (
                <View key={inst.id ?? i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{inst.body}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Source — tapping opens the original URL in the device browser. */}
        {recipe.source_url ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Source</Text>
            <TouchableOpacity
              style={styles.sourceCard}
              onPress={() => Linking.openURL(recipe.source_url!)}
              activeOpacity={0.75}
            >
              <Ionicons name="globe-outline" size={18} color={Colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceName}>{recipe.source_name || 'Web'}</Text>
                <Text style={styles.sourceUrl} numberOfLines={1}>{recipe.source_url}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={Colors.fgMuted} />
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.ctaBtn} onPress={addToMealPlan}>
          <Text style={styles.ctaBtnText}>Add to Meal Plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  hero: {
    height: 280,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
  },
  heroPlaceholder: { backgroundColor: Colors.surfaceSecondary },
  heroActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  heroRight: { flexDirection: 'row', gap: 8 },
  heroBtn: {
    width: 40, height: 40, borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  content: { padding: 24, gap: 24, paddingBottom: 12 },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, color: Colors.fgPrimary },
  desc: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgSecondary, lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.fgPrimary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  section: { gap: 14 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: Colors.fgPrimary },
  ingredientList: { gap: 10 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent, marginTop: 7 },
  ingredientText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgPrimary, lineHeight: 22 },
  instructionList: { gap: 12 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  stepNumText: { color: Colors.fgInverse, fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgPrimary, lineHeight: 22 },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
  },
  sourceName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgPrimary },
  sourceUrl: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  cta: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.surfacePrimary,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ctaBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 99,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.fgInverse },
});
