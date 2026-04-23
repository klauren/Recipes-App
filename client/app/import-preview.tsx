import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { recipeApi, type Ingredient, type Instruction, type Recipe } from '../services/api';

// The scraped payload is JSON-serialised into the `data` URL param by the
// Add Recipe screen so this screen can display it without an extra network call.
type PreviewData = Partial<Recipe> & {
  ingredients: Ingredient[];
  instructions: Instruction[];
};

export default function ImportPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: rawData } = useLocalSearchParams<{ data: string }>();
  const [saving, setSaving] = useState(false);

  // Deserialise the preview payload passed via params.
  const preview: PreviewData | null = (() => {
    try { return JSON.parse(rawData ?? ''); }
    catch { return null; }
  })();

  const totalTime = (preview?.prep_time ?? 0) + (preview?.cook_time ?? 0);

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const recipe = await recipeApi.create(preview as any);
      // Replace the whole import stack with the recipe detail so Back returns to home.
      router.replace(`/recipe/${recipe.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard Import', 'Are you sure? The scraped data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const handleEdit = () => {
    // Navigate to Add Recipe pre-filled — serialise back as params.
    router.replace({ pathname: '/(tabs)/add', params: { prefill: rawData } });
  };

  if (!preview) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Could not load preview.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show at most 5 ingredients in the preview; remainder is indicated by "+ N more".
  const PREVIEW_ING_LIMIT = 5;
  const visibleIngredients = preview.ingredients.slice(0, PREVIEW_ING_LIMIT);
  const hiddenCount = preview.ingredients.length - PREVIEW_ING_LIMIT;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDiscard} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.fgPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Review Import</Text>
        <TouchableOpacity onPress={handleEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color={Colors.fgSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Source pill */}
        {preview.source_name ? (
          <View style={styles.sourcePill}>
            <Ionicons name="globe-outline" size={14} color={Colors.fgSecondary} />
            <Text style={styles.sourceText}>{preview.source_name}</Text>
          </View>
        ) : null}

        {/* Hero image */}
        {preview.image_url ? (
          <View style={styles.heroWrap}>
            <Image source={{ uri: preview.image_url }} style={styles.hero} />
            {preview.difficulty ? (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{preview.difficulty}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.hero, styles.heroEmpty]}>
            <Ionicons name="image-outline" size={40} color={Colors.fgMuted} />
          </View>
        )}

        {/* Title & description */}
        <Text style={styles.recipeTitle}>{preview.title || 'Untitled Recipe'}</Text>
        {preview.description ? (
          <Text style={styles.recipeDesc}>{preview.description}</Text>
        ) : null}

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { icon: 'time-outline' as const,     value: totalTime > 0 ? `${totalTime} min` : '—', label: 'Total Time' },
            { icon: 'people-outline' as const,    value: String(preview.servings ?? 4),              label: 'Servings' },
            { icon: 'trending-up-outline' as const, value: preview.difficulty ?? 'Medium',           label: 'Difficulty' },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={Colors.accent} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Edit nudge */}
        <View style={styles.editNote}>
          <Ionicons name="create-outline" size={18} color={Colors.accent} />
          <Text style={styles.editNoteText}>You can edit all fields after importing</Text>
        </View>

        {/* Ingredient preview */}
        {preview.ingredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Ingredients ({preview.ingredients.length})
            </Text>
            <View style={styles.ingList}>
              {visibleIngredients.map((ing, i) => (
                <View key={i} style={styles.ingRow}>
                  <View style={styles.dot} />
                  <Text style={styles.ingText}>
                    {[ing.amount, ing.unit].filter(Boolean).join(' ')}{ing.amount ? ' ' : ''}{ing.name}
                  </Text>
                </View>
              ))}
              {hiddenCount > 0 && (
                <Text style={styles.moreText}>+ {hiddenCount} more</Text>
              )}
            </View>
          </View>
        )}

        {/* Instruction count */}
        {preview.instructions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Instructions ({preview.instructions.length} steps)
            </Text>
            <Text style={styles.instHint}>Full steps visible after saving.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.fgInverse} />
            : <Text style={styles.saveText}>Save Recipe</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgMuted },
  backLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.accent },
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
  content: { paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sourceText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgSecondary },
  heroWrap: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
  hero: { width: '100%', height: 200, borderRadius: 16 },
  heroEmpty: {
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.accent,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.fgInverse },
  recipeTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, color: Colors.fgPrimary },
  recipeDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgSecondary, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.fgPrimary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.fgMuted },
  editNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
  },
  editNoteText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgSecondary },
  section: { gap: 10 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, color: Colors.fgPrimary },
  ingList: { gap: 8 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent, marginTop: 7, flexShrink: 0 },
  ingText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgPrimary, lineHeight: 20 },
  moreText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.accent },
  instHint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surfacePrimary,
  },
  discardBtn: {
    flex: 1,
    height: 48,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.fgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgSecondary },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 99,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgInverse },
});
